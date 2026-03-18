import { z } from "zod";

export const createCommissionSchema = z.object({
    srId: z.number().int().positive(),
    amount: z.number().positive("Amount must be positive"),
    commissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    note: z.string().optional(),
});

export const getCommissionsQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

export type CreateCommissionInput = z.infer<typeof createCommissionSchema>;
export type GetCommissionsQuery = z.infer<typeof getCommissionsQuerySchema>;
