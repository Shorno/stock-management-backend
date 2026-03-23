import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as withdrawalService from "./service";
import { logError } from "../../lib/error-handler";
import { getWithdrawalsQuerySchema, createWithdrawalInputSchema } from "./validation";
import { requireRole } from "../../lib/auth-middleware";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import { recordEntry } from "../net-asset-ledger/service";

const cashWithdrawalRoutes = new Hono();

// Get all withdrawals
cashWithdrawalRoutes.get(
    "/",
    zValidator("query", getWithdrawalsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const withdrawals = await withdrawalService.getWithdrawals(query);
            return c.json({ success: true, data: withdrawals });
        } catch (error) {
            logError("Error fetching withdrawals:", error);
            return c.json({ success: false, error: "Failed to fetch withdrawals" }, 500);
        }
    }
);

// Get total withdrawals for a date range
cashWithdrawalRoutes.get(
    "/total",
    zValidator("query", getWithdrawalsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const total = await withdrawalService.getTotalWithdrawals(query.startDate, query.endDate);
            return c.json({ success: true, data: { total } });
        } catch (error) {
            logError("Error fetching total withdrawals:", error);
            return c.json({ success: false, error: "Failed to fetch total" }, 500);
        }
    }
);

// Get current cash balance (for validation)
cashWithdrawalRoutes.get(
    "/cash-balance",
    async (c) => {
        try {
            const { getCurrentCashBalance } = await import("../analytics/service");
            const balance = await getCurrentCashBalance();
            return c.json({ success: true, data: { balance } });
        } catch (error) {
            logError("Error fetching cash balance:", error);
            return c.json({ success: false, error: "Failed to fetch cash balance" }, 500);
        }
    }
);


// Create a withdrawal
cashWithdrawalRoutes.post(
    "/",
    zValidator("json", createWithdrawalInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await withdrawalService.createWithdrawal(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            // Audit log with financial impact
            const userInfo = getUserInfoFromContext(c);
            const amount = input.amount;
            const financialImpact: FinancialImpact = {
                amount,
                description: `Cash withdrawal of ৳${amount.toLocaleString()}${input.note ? ` — ${input.note}` : ""}`,
                affectedMetrics: [
                    { metric: "cashBalance", label: "Cash Balance", direction: "decrease", amount },
                    { metric: "netAssets", label: "Net Assets", direction: "decrease", amount },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "CREATE",
                entityType: "cash_withdrawal",
                entityId: result.withdrawalId!,
                entityName: `Withdrawal ৳${amount.toLocaleString()}`,
                newValue: { amount: input.amount, withdrawalDate: input.withdrawalDate, note: input.note },
                metadata: { financialImpact },
            });

            // Record net asset ledger entry
            await recordEntry({
                transactionType: "cash_withdrawal",
                description: `Cash withdrawal — ৳${amount.toLocaleString()}${input.note ? ` (${input.note})` : ""}`,
                amount,
                netAssetChange: -amount,
                affectedComponent: "cash",
                entityType: "cash_withdrawal",
                entityId: result.withdrawalId!,
                transactionDate: input.withdrawalDate,
            });

            return c.json({
                success: true,
                message: result.message,
                withdrawalId: result.withdrawalId,
            });
        } catch (error) {
            logError("Error creating withdrawal:", error);
            return c.json({ success: false, error: "Failed to record withdrawal" }, 500);
        }
    }
);

// Delete a withdrawal (Admin only)
cashWithdrawalRoutes.delete("/:id", requireRole(["admin"]), async (c) => {
    try {
        const withdrawalId = Number(c.req.param("id"));
        if (isNaN(withdrawalId)) {
            return c.json({ success: false, error: "Invalid withdrawal ID" }, 400);
        }

        // Fetch withdrawal data before deleting for audit log
        const allWithdrawals = await withdrawalService.getWithdrawals();
        const withdrawalToDelete = allWithdrawals.find(w => w.id === withdrawalId);

        const result = await withdrawalService.deleteWithdrawal(withdrawalId);

        if (!result.success) {
            return c.json({ success: false, error: result.message }, 404);
        }

        // Audit log with financial impact
        if (withdrawalToDelete) {
            const userInfo = getUserInfoFromContext(c);
            const amount = parseFloat(withdrawalToDelete.amount);
            const financialImpact: FinancialImpact = {
                amount,
                description: `Deleted cash withdrawal of ৳${amount.toLocaleString()}`,
                affectedMetrics: [
                    { metric: "cashBalance", label: "Cash Balance", direction: "increase", amount },
                    { metric: "netAssets", label: "Net Assets", direction: "increase", amount },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "DELETE",
                entityType: "cash_withdrawal",
                entityId: withdrawalId,
                entityName: `Withdrawal ৳${amount.toLocaleString()}`,
                oldValue: withdrawalToDelete,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry
            await recordEntry({
                transactionType: "withdrawal_deleted",
                description: `Withdrawal deleted — ৳${amount.toLocaleString()} restored`,
                amount,
                netAssetChange: amount,
                affectedComponent: "cash",
                entityType: "cash_withdrawal",
                entityId: withdrawalId,
                transactionDate: withdrawalToDelete.withdrawalDate,
            });
        }

        return c.json({ success: true, message: result.message });
    } catch (error) {
        logError("Error deleting withdrawal:", error);
        return c.json({ success: false, error: "Failed to delete withdrawal" }, 500);
    }
});

export { cashWithdrawalRoutes };

