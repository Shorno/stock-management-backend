import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../../lib/auth-middleware";
import { logError } from "../../lib/error-handler";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";
import * as accountService from "./service";
import {
    changePasswordSchema,
    sendPasswordOtpSchema,
    sendPhoneOtpSchema,
    verifyPhoneOtpSchema,
} from "./validation";

/** Self-service account security for the signed-in user (any role). */
const app = new Hono();

const validationHook = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: Context) => {
    if (!result.success) {
        return c.json({ success: false, message: result.error?.issues[0]?.message ?? "Validation failed" }, 400);
    }
};

const currentUser = (c: Context): accountService.AccountUser => {
    const user = c.get("user") as { id: string; name?: string | null };
    return { id: user.id, name: user.name ?? null };
};

const currentSessionId = (c: Context): string | null =>
    (c.get("session") as { id?: string } | null)?.id ?? null;

const fail = (c: Context, label: string, error: unknown) => {
    if (error instanceof accountService.AccountError) {
        if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
        return c.json({ success: false, message: error.message, retryAfter: error.retryAfter }, error.status);
    }
    logError(label, error);
    return c.json({ success: false, message: label }, 500);
};

app.use("*", requireAuth());

app.get("/security", async (c) => {
    try {
        return c.json({ success: true, data: await accountService.getSecurityStatus(currentUser(c).id) });
    } catch (error) {
        return fail(c, "Failed to load account security", error);
    }
});

app.post("/phone/send-otp", zValidator("json", sendPhoneOtpSchema, validationHook), async (c) => {
    try {
        const data = await accountService.requestPhoneOtp(currentUser(c), c.req.valid("json").phone);
        return c.json({ success: true, data, message: `Code sent to ${data.maskedPhone}` });
    } catch (error) {
        return fail(c, "Failed to send verification code", error);
    }
});

app.post("/phone/verify", zValidator("json", verifyPhoneOtpSchema, validationHook), async (c) => {
    try {
        const user = currentUser(c);
        const data = await accountService.verifyPhoneOtp(user, c.req.valid("json").code);
        await auditLog({
            context: c, ...getUserInfoFromContext(c), action: "UPDATE", entityType: "user",
            entityId: user.id, entityName: user.name ?? undefined,
            newValue: { phone: data.maskedPhone }, metadata: { event: "phone_verified" },
        });
        return c.json({ success: true, data, message: "Mobile number verified" });
    } catch (error) {
        return fail(c, "Failed to verify mobile number", error);
    }
});

app.post("/password/send-otp", zValidator("json", sendPasswordOtpSchema, validationHook), async (c) => {
    try {
        const data = await accountService.requestPasswordOtp(currentUser(c), c.req.valid("json").currentPassword);
        return c.json({ success: true, data, message: `Code sent to ${data.maskedPhone}` });
    } catch (error) {
        return fail(c, "Failed to send password change code", error);
    }
});

app.post("/password/change", zValidator("json", changePasswordSchema, validationHook), async (c) => {
    try {
        const user = currentUser(c);
        const data = await accountService.changePassword(user, currentSessionId(c), c.req.valid("json"));
        await auditLog({
            context: c, ...getUserInfoFromContext(c), action: "UPDATE", entityType: "user",
            entityId: user.id, entityName: user.name ?? undefined,
            metadata: { event: "password_changed", otherSessionsSignedOut: data.otherSessionsSignedOut },
        });
        return c.json({ success: true, data, message: "Password changed" });
    } catch (error) {
        return fail(c, "Failed to change password", error);
    }
});

export default app;
