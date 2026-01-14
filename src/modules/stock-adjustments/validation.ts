import { z } from "zod";

// Input schema for creating a stock adjustment
export const createStockAdjustmentSchema = z.object({
    batchId: z.number().optional(), // Optional - can create adjustment without specific batch
    variantId: z.number(),
    adjustmentType: z.enum(["return_restock", "damage", "manual"]),
    quantity: z.number().int(), // Can be positive (add) or negative (remove)
    freeQuantity: z.number().int().default(0),
    orderId: z.number().optional(),
    returnId: z.number().optional(),
    note: z.string().optional(),
});

export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;

// Query schema for listing adjustments
export const getStockAdjustmentsQuerySchema = z.object({
    variantId: z.coerce.number().optional(),
    batchId: z.coerce.number().optional(),
    adjustmentType: z.enum(["return_restock", "damage", "manual"]).optional(),
    limit: z.coerce.number().default(50),
    offset: z.coerce.number().default(0),
});

export type GetStockAdjustmentsQuery = z.infer<typeof getStockAdjustmentsQuerySchema>;

// Get batches for a variant
export const getBatchesQuerySchema = z.object({
    variantId: z.coerce.number(),
});

export type GetBatchesQuery = z.infer<typeof getBatchesQuerySchema>;
