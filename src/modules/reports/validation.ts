import { z } from "zod";

// Query schema for daily sales collection report
export const dailySalesCollectionQuerySchema = z.object({
    date: z.string().optional(), // YYYY-MM-DD format, defaults to today
    startDate: z.string().optional(), // For date range queries
    endDate: z.string().optional(),
    dsrId: z.coerce.number().int().positive().optional(),
    routeId: z.coerce.number().int().positive().optional(),
});

export type DailySalesCollectionQuery = z.infer<typeof dailySalesCollectionQuerySchema>;

// Query schema for DSR Ledger report
export const dsrLedgerQuerySchema = z.object({
    dsrId: z.coerce.number().int().positive(),
    startDate: z.string(), // YYYY-MM-DD format, required
    endDate: z.string(),   // YYYY-MM-DD format, required
});

export type DsrLedgerQuery = z.infer<typeof dsrLedgerQuerySchema>;
