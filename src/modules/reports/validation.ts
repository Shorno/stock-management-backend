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

// Query schema for DSR Ledger Overview report
export const dsrLedgerOverviewQuerySchema = z.object({
    startDate: z.string(), // YYYY-MM-DD format, required
    endDate: z.string(),   // YYYY-MM-DD format, required
});

export type DsrLedgerOverviewQuery = z.infer<typeof dsrLedgerOverviewQuerySchema>;

// Query schema for DSR Due Summary (no required params - returns all DSRs with dues)
export const dsrDueSummaryQuerySchema = z.object({});

export type DsrDueSummaryQuery = z.infer<typeof dsrDueSummaryQuerySchema>;

export const productWiseSalesQuerySchema = z.object({
    startDate: z.string(), // YYYY-MM-DD format, required
    endDate: z.string(),   // YYYY-MM-DD format, required
    dsrId: z.coerce.number().int().positive().optional(),
    routeId: z.coerce.number().int().positive().optional(),
    srId: z.coerce.number().int().positive().optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    brandId: z.coerce.number().int().positive().optional(),
    productId: z.coerce.number().int().positive().optional(),
});

export type ProductWiseSalesQuery = z.infer<typeof productWiseSalesQuerySchema>;

// Query schema for Brand Wise Sales report
export const brandWiseSalesQuerySchema = z.object({
    startDate: z.string().optional(), // YYYY-MM-DD format, optional (defaults to all time)
    endDate: z.string().optional(),   // YYYY-MM-DD format, optional
    brandId: z.coerce.number().int().positive().optional(),
});

export type BrandWiseSalesQuery = z.infer<typeof brandWiseSalesQuerySchema>;

// Query schema for Daily Settlement report
export const dailySettlementQuerySchema = z.object({
    date: z.string().optional(), // YYYY-MM-DD format, defaults to today
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    dsrId: z.coerce.number().int().positive().optional(),
    routeId: z.coerce.number().int().positive().optional(),
});

export type DailySettlementQuery = z.infer<typeof dailySettlementQuerySchema>;

// Query schema for Brand Wise Purchase report
export const brandWisePurchaseQuerySchema = z.object({
    startDate: z.string().optional(), // YYYY-MM-DD format, optional (defaults to all time)
    endDate: z.string().optional(),   // YYYY-MM-DD format, optional
});

export type BrandWisePurchaseQuery = z.infer<typeof brandWisePurchaseQuerySchema>;

// Query schema for SR Sales report
export const srSalesQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    srId: z.coerce.number().int().positive().optional(),
    routeId: z.coerce.number().int().positive().optional(),
});

export type SrSalesQuery = z.infer<typeof srSalesQuerySchema>;

const commaSeparatedIds = z.string()
    .regex(/^\d+(,\d+)*$/, "IDs must be comma-separated integers")
    .transform((value) => Array.from(new Set(value.split(",").map(Number))));

export const expenseCommissionQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    srIds: commaSeparatedIds.optional(), // 0 represents DB Point
    dsrIds: commaSeparatedIds
        .refine((ids) => ids.every((id) => id > 0), "DSR IDs must be positive")
        .optional(),
}).refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    { message: "Start date must not be after end date", path: ["startDate"] }
);

export type ExpenseCommissionQuery = z.infer<typeof expenseCommissionQuerySchema>;

// Query schema for Inventory Snapshot
export const inventorySnapshotQuerySchema = z.object({
    date: z.string().optional(), // YYYY-MM-DD format, defaults to latest
    search: z.string().optional(), // Search product name
    brandId: z.coerce.number().int().positive().optional(),
});

export type InventorySnapshotQuery = z.infer<typeof inventorySnapshotQuerySchema>;
