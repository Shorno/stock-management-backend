import { z } from "zod";

export const createBillTypeSchema = z.object({
    code: z.string().min(1, "Code is required").max(20, "Code must be 20 characters or less"),
    name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
});

export const updateBillTypeSchema = z.object({
    code: z.string().min(1).max(20).optional(),
    name: z.string().min(1).max(100).optional(),
});

export type CreateBillTypeInput = z.infer<typeof createBillTypeSchema>;
export type UpdateBillTypeInput = z.infer<typeof updateBillTypeSchema>;
