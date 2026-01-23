import { z } from "zod";

// Query schema for getting DSR loan summary list
export const getDSRLoanSummaryQuerySchema = z.object({
    search: z.string().optional(),
});

export type GetDSRLoanSummaryQuery = z.infer<typeof getDSRLoanSummaryQuerySchema>;

// Query schema for getting transaction history
export const getDSRLoanTransactionsQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    transactionType: z.enum(["loan", "repayment"]).optional(),
});

export type GetDSRLoanTransactionsQuery = z.infer<typeof getDSRLoanTransactionsQuerySchema> & {
    dsrId: number;
};

// Input schema for creating a loan transaction (DSR takes money)
export const createLoanInputSchema = z.object({
    dsrId: z.number().positive("DSR ID is required"),
    amount: z.number().positive("Amount must be greater than 0"),
    transactionDate: z.string(),
    paymentMethod: z.string().optional(),
    note: z.string().optional(),
    referenceNumber: z.string().optional(),
});

export type CreateLoanInput = z.infer<typeof createLoanInputSchema>;

// Input schema for creating a repayment transaction (DSR pays back)
export const createRepaymentInputSchema = z.object({
    dsrId: z.number().positive("DSR ID is required"),
    amount: z.number().positive("Amount must be greater than 0"),
    transactionDate: z.string(),
    paymentMethod: z.string().optional(),
    note: z.string().optional(),
    referenceNumber: z.string().optional(),
});

export type CreateRepaymentInput = z.infer<typeof createRepaymentInputSchema>;

// Schema for deleting a transaction
export const deleteTransactionParamsSchema = z.object({
    id: z.coerce.number().positive("Transaction ID is required"),
});
