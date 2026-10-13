import { z } from "zod";

// Input schema for creating a stock adjustment
export const createStockAdjustmentSchema = z.object({
    batchId: z.number().int().positive("Select a stock batch"),
    variantId: z.number().int().positive(),
    adjustmentType: z.enum(["restock", "return_restock", "damage", "manual"]),
    quantity: z.number().int(), // Can be positive (add) or negative (remove)
    freeQuantity: z.number().int().default(0),
    orderId: z.number().optional(),
    returnId: z.number().optional(),
    note: z.string().optional(),
}).superRefine((input, ctx) => {
    if (input.adjustmentType === "restock" || input.adjustmentType === "return_restock") {
        if (input.quantity <= 0) {
            ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be a positive integer" });
        }
        if (input.freeQuantity < 0) {
            ctx.addIssue({ code: "custom", path: ["freeQuantity"], message: "Free quantity cannot be negative" });
        }
    }
});

export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;

// Query schema for listing adjustments
export const getStockAdjustmentsQuerySchema = z.object({
    variantId: z.coerce.number().optional(),
    batchId: z.coerce.number().optional(),
    adjustmentType: z.enum(["restock", "return_restock", "damage", "manual"]).optional(),
    limit: z.coerce.number().default(50),
    offset: z.coerce.number().default(0),
});

export type GetStockAdjustmentsQuery = z.infer<typeof getStockAdjustmentsQuerySchema>;

// Get batches for a variant
export const getBatchesQuerySchema = z.object({
    variantId: z.coerce.number(),
});

export type GetBatchesQuery = z.infer<typeof getBatchesQuerySchema>;
