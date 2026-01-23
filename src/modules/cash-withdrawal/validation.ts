import { z } from "zod";

// Query schema for getting withdrawals
export const getWithdrawalsQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

export type GetWithdrawalsQuery = z.infer<typeof getWithdrawalsQuerySchema>;

// Input schema for creating a withdrawal
export const createWithdrawalInputSchema = z.object({
    amount: z.number().positive("Amount must be greater than 0"),
    withdrawalDate: z.string(),
    note: z.string().optional(),
});

export type CreateWithdrawalInput = z.infer<typeof createWithdrawalInputSchema>;
