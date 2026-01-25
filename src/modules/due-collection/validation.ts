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

// Query schema for DSR due summary
export const getDSRDueSummaryQuerySchema = z.object({
    search: z.string().optional(),
});

export type GetDSRDueSummaryQuery = z.infer<typeof getDSRDueSummaryQuerySchema>;

// Query schema for DSR collection history (dsrId comes from URL params, not query)
export const getDSRCollectionHistoryQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

// Full type includes dsrId which is added from URL params
export type GetDSRCollectionHistoryQuery = z.infer<typeof getDSRCollectionHistoryQuerySchema> & {
    dsrId: number;
};

// Input schema for collecting DSR due (DSR's own due from order adjustments)
export const collectDsrDueInputSchema = z.object({
    dsrId: z.number(),
    amount: z.number().positive("Amount must be greater than 0"),
    collectionDate: z.string(),
    paymentMethod: z.string().optional(),
    note: z.string().optional(),
    dsrDueId: z.number().optional(), // Optional: specify a specific DSR due record to collect from
});

export type CollectDsrDueInput = z.infer<typeof collectDsrDueInputSchema>;
