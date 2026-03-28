import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as stockAdjustmentService from "./service";
import { logError } from "../../lib/error-handler";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import { recordEntry } from "../net-asset-ledger/service";
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

            // Record net asset ledger entry
            // Fetch batch cost for accurate net asset change
            try {
                if (input.batchId) {
                    const { db } = await import("../../db/config");
                    const { stockBatch } = await import("../../db/schema/product-schema");
                    const { eq } = await import("drizzle-orm");
                    const [batch] = await db.select({ supplierPrice: stockBatch.supplierPrice }).from(stockBatch).where(eq(stockBatch.id, input.batchId)).limit(1);
                    const costPerUnit = Number(batch?.supplierPrice || 0);
                    const totalCost = costPerUnit * input.quantity;
                    const isDamage = input.adjustmentType === "damage";
                    const today = new Date().toISOString().split("T")[0] as string;
                    await recordEntry({
                        transactionType: "stock_adjustment",
                        description: `Stock ${input.adjustmentType}: ${input.quantity} units — ৳${totalCost.toLocaleString()}${input.note ? ` (${input.note})` : ""}`,
                        amount: totalCost,
                        netAssetChange: isDamage ? -totalCost : totalCost,
                        affectedComponent: "stock",
                        entityType: "stock_adjustment",
                        entityId: (result as any).adjustmentId || 0,
                        transactionDate: today,
                    });
                }
            } catch (ledgerErr) {
                console.error("[Ledger] Failed to record stock adjustment:", ledgerErr);
            }

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
