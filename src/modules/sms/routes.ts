import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireRole } from "../../lib/auth-middleware";
import { logError } from "../../lib/error-handler";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";
import * as smsService from "./service";
import { getBalance, getReport, isSmsConfigured } from "./alpha-sms";
import { SMS_PLACEHOLDERS } from "./template";
import {
    getRecipientsQuerySchema,
    getSmsLogsQuerySchema,
    previewSmsSchema,
    sendSmsSchema,
    smsTemplateInputSchema,
    testSmsSchema,
    updateSmsSettingsSchema,
} from "./validation";

const app = new Hono();

const validationHook = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: Context) => {
    if (!result.success) {
        return c.json({
            success: false,
            message: result.error?.issues[0]?.message ?? "Validation failed",
            errors: result.error?.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        }, 400);
    }
};

const senderFrom = (c: Context): smsService.SmsSender => {
    const user = c.get("user") as { id?: string; name?: string } | null;
    return { id: user?.id ?? null, name: user?.name ?? null };
};

const fail = (c: Context, label: string, error: unknown) => {
    if (error instanceof smsService.SmsNotReadyError) {
        return c.json({ success: false, message: error.message }, 400);
    }
    logError(label, error);
    return c.json({ success: false, message: error instanceof Error ? error.message : label }, 500);
};

const parseId = (c: Context) => {
    const id = Number(c.req.param("id"));
    return Number.isInteger(id) && id > 0 ? id : null;
};

app.use("*", requireRole(["admin", "manager"]));

// ---------- Settings ----------

app.get("/settings", async (c) => {
    try {
        const settings = await smsService.getSmsSettings();
        return c.json({
            success: true,
            data: { ...settings, apiConfigured: isSmsConfigured(), placeholders: SMS_PLACEHOLDERS },
        });
    } catch (error) {
        return fail(c, "Failed to load SMS settings", error);
    }
});

app.put("/settings", requireRole(["admin"]), zValidator("json", updateSmsSettingsSchema, validationHook), async (c) => {
    try {
        const input = c.req.valid("json");
        const updated = await smsService.updateSmsSettings(input);
        await auditLog({
            context: c, ...getUserInfoFromContext(c), action: "UPDATE", entityType: "settings",
            entityId: "sms", entityName: "SMS Settings", newValue: input,
        });
        return c.json({ success: true, data: { ...updated, apiConfigured: isSmsConfigured(), placeholders: SMS_PLACEHOLDERS }, message: "SMS settings saved" });
    } catch (error) {
        return fail(c, "Failed to save SMS settings", error);
    }
});

app.get("/balance", async (c) => {
    try {
        if (!isSmsConfigured()) return c.json({ success: false, message: "SMS API key is not configured on the server" }, 400);
        return c.json({ success: true, data: { balance: await getBalance() } });
    } catch (error) {
        return c.json({ success: false, message: error instanceof Error ? error.message : "Failed to load balance" }, 502);
    }
});

app.post("/test", requireRole(["admin"]), zValidator("json", testSmsSchema, validationHook), async (c) => {
    try {
        const { phone, message } = c.req.valid("json");
        const result = await smsService.sendTestSms(phone, message, senderFrom(c));
        if (result.status !== "sent") return c.json({ success: false, message: result.error ?? "SMS not sent" }, 400);
        return c.json({ success: true, message: `Test SMS sent to ${result.phone}` });
    } catch (error) {
        return fail(c, "Failed to send test SMS", error);
    }
});

// ---------- Saved templates ----------

app.get("/templates", async (c) => {
    try {
        return c.json({ success: true, data: await smsService.listTemplates() });
    } catch (error) {
        return fail(c, "Failed to load SMS templates", error);
    }
});

app.post("/templates", zValidator("json", smsTemplateInputSchema, validationHook), async (c) => {
    try {
        const row = await smsService.createTemplate(c.req.valid("json"));
        return c.json({ success: true, data: row, message: "Template saved" }, 201);
    } catch (error) {
        return fail(c, "Failed to save SMS template", error);
    }
});

app.put("/templates/:id", zValidator("json", smsTemplateInputSchema, validationHook), async (c) => {
    try {
        const id = parseId(c);
        if (!id) return c.json({ success: false, message: "Invalid template ID" }, 400);
        const row = await smsService.updateTemplate(id, c.req.valid("json"));
        if (!row) return c.json({ success: false, message: "Template not found" }, 404);
        return c.json({ success: true, data: row, message: "Template updated" });
    } catch (error) {
        return fail(c, "Failed to update SMS template", error);
    }
});

app.delete("/templates/:id", async (c) => {
    try {
        const id = parseId(c);
        if (!id) return c.json({ success: false, message: "Invalid template ID" }, 400);
        const deleted = await smsService.deleteTemplate(id);
        if (!deleted) return c.json({ success: false, message: "Template not found" }, 404);
        return c.json({ success: true, message: "Template deleted" });
    } catch (error) {
        return fail(c, "Failed to delete SMS template", error);
    }
});

// ---------- Recipients, preview, send ----------

app.get("/recipients", zValidator("query", getRecipientsQuerySchema, validationHook), async (c) => {
    try {
        return c.json({ success: true, data: await smsService.getRecipients(c.req.valid("query")) });
    } catch (error) {
        return fail(c, "Failed to load SMS recipients", error);
    }
});

app.post("/preview", zValidator("json", previewSmsSchema, validationHook), async (c) => {
    try {
        const { message, customerId } = c.req.valid("json");
        return c.json({ success: true, data: await smsService.previewMessage(message, customerId, senderFrom(c)) });
    } catch (error) {
        return fail(c, "Failed to preview SMS", error);
    }
});

app.post("/send", zValidator("json", sendSmsSchema, validationHook), async (c) => {
    try {
        const input = c.req.valid("json");
        const result = await smsService.sendToCustomers(input, senderFrom(c));
        const message = result.background
            ? `Sending SMS to ${result.total} customers in the background. Check SMS History for results.`
            : `SMS sent: ${result.sent}${result.failed ? `, failed: ${result.failed}` : ""}${result.skipped ? `, no mobile: ${result.skipped}` : ""}`;
        return c.json({ success: true, data: result, message });
    } catch (error) {
        return fail(c, "Failed to send SMS", error);
    }
});

// ---------- History ----------

app.get("/logs", zValidator("query", getSmsLogsQuerySchema, validationHook), async (c) => {
    try {
        return c.json({ success: true, data: await smsService.listLogs(c.req.valid("query")) });
    } catch (error) {
        return fail(c, "Failed to load SMS history", error);
    }
});

app.get("/reports/:requestId", async (c) => {
    try {
        if (!isSmsConfigured()) return c.json({ success: false, message: "SMS API key is not configured on the server" }, 400);
        return c.json({ success: true, data: await getReport(c.req.param("requestId")) });
    } catch (error) {
        return c.json({ success: false, message: error instanceof Error ? error.message : "Failed to load delivery report" }, 502);
    }
});

export default app;
