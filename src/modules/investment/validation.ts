import { z } from "zod";

// Query schema for getting investments
export const getInvestmentsQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

export type GetInvestmentsQuery = z.infer<typeof getInvestmentsQuerySchema>;

// Query schema for the difference history
export const getDifferenceHistoryQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});

// Input schema for creating an investment
export const createInvestmentInputSchema = z.object({
    amount: z.number().positive("Amount must be greater than 0"),
    investmentDate: z.string(),
    note: z.string().optional(),
});

export type CreateInvestmentInput = z.infer<typeof createInvestmentInputSchema>;

// Input schema for creating a withdrawal
export const createWithdrawalInputSchema = z.object({
    amount: z.number().positive("Amount must be greater than 0"),
    withdrawalDate: z.string(),
    note: z.string().optional(),
});

export type CreateWithdrawalInput = z.infer<typeof createWithdrawalInputSchema>;
