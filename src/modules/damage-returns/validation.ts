import { z } from "zod";

// Return types enum
export const returnTypeEnum = z.enum(["customer_return", "damage", "expired", "defective"]);
export const returnStatusEnum = z.enum(["pending", "approved", "rejected"]);
export const conditionEnum = z.enum(["resellable", "damaged"]);

// Create return item schema
const createReturnItemSchema = z.object({
    variantId: z.number().int().positive(),
    batchId: z.number().int().positive().optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    condition: conditionEnum.default("damaged"),
    reason: z.string().optional(),
});

// Create damage return schema
export const createDamageReturnSchema = z.object({
    dsrId: z.number().int().positive(),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    returnType: returnTypeEnum,
    notes: z.string().optional(),
    items: z.array(createReturnItemSchema).min(1, "At least one item is required"),
});

// Update damage return status schema
export const updateReturnStatusSchema = z.object({
    status: returnStatusEnum,
    notes: z.string().optional(),
});

// Query schema for listing returns
export const getDamageReturnsQuerySchema = z.object({
    dsrId: z.coerce.number().int().positive().optional(),
    status: returnStatusEnum.optional(),
    returnType: returnTypeEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().positive().default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
});

// Types inferred from schemas
export type CreateDamageReturnInput = z.infer<typeof createDamageReturnSchema>;
export type UpdateReturnStatusInput = z.infer<typeof updateReturnStatusSchema>;
export type GetDamageReturnsQuery = z.infer<typeof getDamageReturnsQuerySchema>;
