import { z } from "zod";

export const createPlAdjustmentSchema = z.object({
    title: z.string().min(1, "Title is required"),
    type: z.enum(["income", "expense"], { message: "Type must be 'income' or 'expense'" }),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    note: z.string().optional(),
    adjustmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
});

export const getPlAdjustmentsQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreatePlAdjustmentInput = z.infer<typeof createPlAdjustmentSchema>;
export type GetPlAdjustmentsQuery = z.infer<typeof getPlAdjustmentsQuerySchema>;
