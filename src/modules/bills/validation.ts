import { z } from "zod";

export const createBillSchema = z.object({
    title: z.string().min(1, "Title is required"),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
    note: z.string().optional(),
    billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
});

export const updateBillSchema = z.object({
    title: z.string().min(1).optional(),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    note: z.string().optional(),
    billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getBillsQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
export type GetBillsQuery = z.infer<typeof getBillsQuerySchema>;
