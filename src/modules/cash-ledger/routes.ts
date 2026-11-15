import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireRole } from "../../lib/auth-middleware";
import { logError } from "../../lib/error-handler";
import { CASH_LEDGER_TYPES, getCashLedger, type CashLedgerType } from "./service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

export const cashLedgerQuerySchema = z.object({
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    // Comma-separated list, e.g. "order_payment,due_collection"
    types: z.string().optional().transform((value, ctx) => {
        if (!value) return undefined;
        const types = value.split(",").map((t) => t.trim()).filter(Boolean);
        const unknown = types.filter((t) => !(CASH_LEDGER_TYPES as readonly string[]).includes(t));
        if (unknown.length > 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown type: ${unknown.join(", ")}` });
            return z.NEVER;
        }
        return types as CashLedgerType[];
    }),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    order: z.enum(["asc", "desc"]).optional(),
});

const cashLedgerRoutes = new Hono();

// GET /api/cash-ledger - every cash movement with the running balance
cashLedgerRoutes.get(
    "/",
    requireRole(["admin", "super_admin", "manager"]),
    zValidator("query", cashLedgerQuerySchema),
    async (c) => {
        try {
            const data = await getCashLedger(c.req.valid("query"));
            return c.json({ success: true, data });
        } catch (error) {
            logError("Error fetching cash ledger:", error);
            return c.json({ success: false, error: "Failed to fetch cash ledger" }, 500);
        }
    }
);

export { cashLedgerRoutes };
