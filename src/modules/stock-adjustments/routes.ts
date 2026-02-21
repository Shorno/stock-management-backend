import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as stockAdjustmentService from "./service";
import { logError } from "../../lib/error-handler";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import {
    createStockAdjustmentSchema,
    getStockAdjustmentsQuerySchema,
    getBatchesQuerySchema,
} from "./validation";

const stockAdjustmentRoutes = new Hono();

// Create a new stock adjustment
stockAdjustmentRoutes.post(
    "/",
    zValidator("json", createStockAdjustmentSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            // TODO: Get createdBy from auth context
            const result = await stockAdjustmentService.createStockAdjustment(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            // Audit log
            const userInfo = getUserInfoFromContext(c);
            await auditLog({
                context: c,
                ...userInfo,
                action: "CREATE",
                entityType: "stock_adjustment",
                entityId: (result as any).adjustmentId || "new",
                entityName: `Stock Adjustment (${input.adjustmentType})`,
                newValue: input,
                metadata: {
                    description: `Stock ${input.adjustmentType} adjustment`,
                    financialImpact: {
                        amount: 0,
                        description: `Stock ${input.adjustmentType} for variant #${input.variantId}`,
                        affectedMetrics: [
                            { metric: "currentStock", label: "Current Stock", direction: input.adjustmentType === "damage" ? "decrease" : "increase", amount: input.quantity },
                        ],
                    } as FinancialImpact,
                },
            });

            return c.json({ success: true, data: result });
        } catch (error) {
            logError("Error creating stock adjustment:", error);
            return c.json({ success: false, error: "Failed to create stock adjustment" }, 500);
        }
    }
);

// Get stock adjustments with filters
stockAdjustmentRoutes.get(
    "/",
    zValidator("query", getStockAdjustmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const adjustments = await stockAdjustmentService.getStockAdjustments(query);
            return c.json({ success: true, data: adjustments });
        } catch (error) {
            logError("Error fetching stock adjustments:", error);
            return c.json({ success: false, error: "Failed to fetch stock adjustments" }, 500);
        }
    }
);

// Get batches for a variant (for restock batch selection)
stockAdjustmentRoutes.get(
    "/batches",
    zValidator("query", getBatchesQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const batches = await stockAdjustmentService.getBatchesForVariant(query);
            return c.json({ success: true, data: batches });
        } catch (error) {
            logError("Error fetching batches:", error);
            return c.json({ success: false, error: "Failed to fetch batches" }, 500);
        }
    }
);

export { stockAdjustmentRoutes };
