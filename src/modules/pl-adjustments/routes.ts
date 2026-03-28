import { Hono } from "hono";
import { logError } from "../../lib/error-handler";
import { zValidator } from "@hono/zod-validator";
import * as plAdjustmentsService from "./service";
import { createPlAdjustmentSchema, getPlAdjustmentsQuerySchema } from "./validation";
import { requireRole } from "../../lib/auth-middleware";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import { recordEntry } from "../net-asset-ledger/service";

const plAdjustmentRoutes = new Hono();

// Get all P&L adjustments
plAdjustmentRoutes.get(
    "/",
    zValidator("query", getPlAdjustmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const adjustments = await plAdjustmentsService.getPlAdjustments(query);
            return c.json({ success: true, data: adjustments });
        } catch (error) {
            logError("Error fetching P&L adjustments:", error);
            return c.json({ success: false, error: "Failed to fetch P&L adjustments" }, 500);
        }
    }
);

// Get P&L adjustments summary
plAdjustmentRoutes.get(
    "/summary",
    zValidator("query", getPlAdjustmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const summary = await plAdjustmentsService.getPlAdjustmentsSummary(query);
            return c.json({ success: true, data: summary });
        } catch (error) {
            logError("Error fetching P&L adjustments summary:", error);
            return c.json({ success: false, error: "Failed to fetch summary" }, 500);
        }
    }
);

// Create a new P&L adjustment
plAdjustmentRoutes.post(
    "/",
    zValidator("json", createPlAdjustmentSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const adjustment = await plAdjustmentsService.createPlAdjustment(input);

            // Audit log with financial impact
            const userInfo = getUserInfoFromContext(c);
            const amount = parseFloat(String(input.amount));
            const isIncome = input.type === "income";
            const financialImpact: FinancialImpact = {
                amount,
                description: `P&L ${input.type}: "${input.title}" ৳${amount.toLocaleString()}`,
                affectedMetrics: [
                    {
                        metric: "profitLoss",
                        label: "Profit/Loss",
                        direction: isIncome ? "increase" : "decrease",
                        amount,
                    },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "CREATE",
                entityType: "pl_adjustment",
                entityId: (adjustment as any).id,
                entityName: input.title,
                newValue: adjustment,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry
            await recordEntry({
                transactionType: "pl_adjustment",
                description: `P&L ${input.type}: ${input.title} — ৳${amount.toLocaleString()}`,
                amount,
                netAssetChange: 0,
                affectedComponent: "profitLoss",
                entityType: "pl_adjustment",
                entityId: (adjustment as any).id,
                transactionDate: input.adjustmentDate,
            });

            return c.json({ success: true, data: adjustment, message: "P&L adjustment created successfully" });
        } catch (error) {
            logError("Error creating P&L adjustment:", error);
            return c.json({ success: false, error: "Failed to create P&L adjustment" }, 500);
        }
    }
);

// Delete a P&L adjustment (Admin only)
plAdjustmentRoutes.delete("/:id", requireRole(["admin", "super_admin"]), async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, error: "Invalid adjustment ID" }, 400);
        }

        // Fetch before deleting for audit
        const allAdjustments = await plAdjustmentsService.getPlAdjustments({});
        const adjustmentToDelete = allAdjustments.find((a: any) => a.id === id);

        const deleted = await plAdjustmentsService.deletePlAdjustment(id);
        if (!deleted) {
            return c.json({ success: false, error: "Adjustment not found" }, 404);
        }

        if (adjustmentToDelete) {
            const userInfo = getUserInfoFromContext(c);
            const amount = parseFloat(String(adjustmentToDelete.amount || 0));
            const isIncome = adjustmentToDelete.type === "income";
            const financialImpact: FinancialImpact = {
                amount,
                description: `Deleted P&L ${adjustmentToDelete.type}: "${adjustmentToDelete.title}" ৳${amount.toLocaleString()}`,
                affectedMetrics: [
                    {
                        metric: "profitLoss",
                        label: "Profit/Loss",
                        direction: isIncome ? "decrease" : "increase",
                        amount,
                    },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "DELETE",
                entityType: "pl_adjustment",
                entityId: id,
                entityName: adjustmentToDelete.title,
                oldValue: adjustmentToDelete,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry
            await recordEntry({
                transactionType: "pl_adjustment_deleted",
                description: `P&L ${adjustmentToDelete.type} deleted: ${adjustmentToDelete.title} — ৳${amount.toLocaleString()}`,
                amount,
                netAssetChange: 0,
                affectedComponent: "profitLoss",
                entityType: "pl_adjustment",
                entityId: id,
                transactionDate: adjustmentToDelete.adjustmentDate || new Date().toISOString().split("T")[0] as string,
            });
        }

        return c.json({ success: true, message: "P&L adjustment deleted successfully" });
    } catch (error) {
        logError("Error deleting P&L adjustment:", error);
        return c.json({ success: false, error: "Failed to delete P&L adjustment" }, 500);
    }
});

export { plAdjustmentRoutes };

