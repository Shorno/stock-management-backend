import { z } from "zod";

export const createStockBatchSchema = z.object({
    supplierPrice: z.coerce.number().positive("Supplier price must be positive"),
    sellPrice: z.coerce.number().positive("Sell price must be positive"),
    quantity: z.coerce.number().int("Quantity must be an integer").positive("Quantity must be positive"),
    freeQuantity: z.coerce.number().int("Free quantity must be an integer").nonnegative("Free quantity cannot be negative").default(0),
});

export const updateStockBatchSchema = z.object({
    supplierPrice: z.coerce.number().positive("Supplier price must be positive").optional(),
    sellPrice: z.coerce.number().positive("Sell price must be positive").optional(),
    remainingQuantity: z.coerce.number().int("Quantity must be an integer").nonnegative("Quantity cannot be negative").optional(),
    remainingFreeQty: z.coerce.number().int("Free quantity must be an integer").nonnegative("Free quantity cannot be negative").optional(),
});

export const getStockBatchesQuerySchema = z.object({
    limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
    offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateStockBatchInput = z.infer<typeof createStockBatchSchema>;
export type UpdateStockBatchInput = z.infer<typeof updateStockBatchSchema>;
export type GetStockBatchesQuery = z.infer<typeof getStockBatchesQuerySchema>;
