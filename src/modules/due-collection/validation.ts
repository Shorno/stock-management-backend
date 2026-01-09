import { z } from "zod";

// Query schema for getting customers with dues
export const getCustomersWithDuesQuerySchema = z.object({
    routeId: z.coerce.number().optional(),
    dsrId: z.coerce.number().optional(),
    search: z.string().optional(),
});

export type GetCustomersWithDuesQuery = z.infer<typeof getCustomersWithDuesQuerySchema>;

// Input schema for collecting due
export const collectDueInputSchema = z.object({
    customerId: z.number(),
    amount: z.number().positive("Amount must be greater than 0"),
    collectionDate: z.string(),
    paymentMethod: z.string().optional(),
    collectedByDsrId: z.number().optional(),
    note: z.string().optional(),
    dueId: z.number().optional(), // Optional: specify a specific due to collect
});

export type CollectDueInput = z.infer<typeof collectDueInputSchema>;

// Query schema for collection history
export const getCollectionHistoryQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    customerId: z.coerce.number().optional(),
    dsrId: z.coerce.number().optional(),
});

export type GetCollectionHistoryQuery = z.infer<typeof getCollectionHistoryQuerySchema>;
