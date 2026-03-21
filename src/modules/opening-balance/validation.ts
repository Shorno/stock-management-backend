import { z } from "zod";

const openingBalanceTypes = [
    "cash",
    "customer_due",
    "dsr_due",
    "sr_due",
    "supplier_balance",
    "dsr_loan",
    "investment",
    "profit_loss",
] as const;

export const upsertOpeningBalanceSchema = z.object({
    type: z.enum(openingBalanceTypes),
    entityId: z.number().int().positive().optional().nullable(),
    entityName: z.string().max(150).optional().nullable(),
    amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Invalid amount format"),
    balanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
    note: z.string().optional().nullable(),
});

export const getOpeningBalancesQuerySchema = z.object({
    type: z.enum(openingBalanceTypes).optional(),
});

export type UpsertOpeningBalanceInput = z.infer<typeof upsertOpeningBalanceSchema>;
export type GetOpeningBalancesQuery = z.infer<typeof getOpeningBalancesQuerySchema>;
