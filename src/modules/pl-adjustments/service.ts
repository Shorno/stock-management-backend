import { db } from "../../db/config";
import { plAdjustments } from "../../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { CreatePlAdjustmentInput, GetPlAdjustmentsQuery } from "./validation";

export interface PlAdjustment {
    id: number;
    title: string;
    type: string;
    amount: string;
    note: string | null;
    adjustmentDate: string;
    affectsNetAssets: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface PlAdjustmentNetEffects {
    // Net of adjustments that count in net assets (income − expense)
    netAssets: number;
    // Net of older adjustments that only ever changed profit (income − expense)
    profitOnly: number;
}

/**
 * Net asset change caused by one adjustment: income adds, expense subtracts,
 * and profit-only adjustments change nothing.
 */
export const plAdjustmentNetAssetChange = (adjustment: Pick<PlAdjustment, "type" | "amount" | "affectsNetAssets">): number => {
    if (!adjustment.affectsNetAssets) return 0;
    const amount = parseFloat(adjustment.amount);
    return adjustment.type === "income" ? amount : -amount;
};

export interface PlAdjustmentsSummary {
    totalIncome: string;
    totalExpense: string;
    netAdjustment: string;
    count: number;
}

/**
 * Get all P&L adjustments with optional date filtering
 */
export const getPlAdjustments = async (query: GetPlAdjustmentsQuery): Promise<PlAdjustment[]> => {
    const conditions = [];

    if (query.startDate) {
        conditions.push(gte(plAdjustments.adjustmentDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(plAdjustments.adjustmentDate, query.endDate));
    }

    const result = await db
        .select()
        .from(plAdjustments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(plAdjustments.adjustmentDate), desc(plAdjustments.createdAt));

    return result;
};

/**
 * Create a new P&L adjustment
 */
export const createPlAdjustment = async (input: CreatePlAdjustmentInput, database = db): Promise<PlAdjustment> => {
    const [newAdjustment] = await database
        .insert(plAdjustments)
        .values({
            title: input.title,
            type: input.type,
            amount: input.amount,
            note: input.note || null,
            adjustmentDate: input.adjustmentDate,
            affectsNetAssets: true,
        })
        .returning();

    return newAdjustment!;
};

/**
 * All-time net effect of adjustments, split by whether they count in net assets.
 * Not date filtered: net assets are a running balance.
 */
export const getPlAdjustmentNetEffects = async (database = db): Promise<PlAdjustmentNetEffects> => {
    const signedAmount = sql`CASE WHEN ${plAdjustments.type} = 'income' THEN CAST(${plAdjustments.amount} AS DECIMAL) ELSE -CAST(${plAdjustments.amount} AS DECIMAL) END`;
    const [row] = await database
        .select({
            netAssets: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.affectsNetAssets} THEN ${signedAmount} ELSE 0 END), 0)`,
            profitOnly: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.affectsNetAssets} THEN 0 ELSE ${signedAmount} END), 0)`,
        })
        .from(plAdjustments);

    return {
        netAssets: Number(row?.netAssets || 0),
        profitOnly: Number(row?.profitOnly || 0),
    };
};

/**
 * Delete a P&L adjustment by ID
 */
export const deletePlAdjustment = async (id: number): Promise<boolean> => {
    const result = await db
        .delete(plAdjustments)
        .where(eq(plAdjustments.id, id))
        .returning({ id: plAdjustments.id });

    return result.length > 0;
};

/**
 * Get P&L adjustments summary (totals by type) for a date range
 */
export const getPlAdjustmentsSummary = async (query: GetPlAdjustmentsQuery): Promise<PlAdjustmentsSummary> => {
    const conditions = [];

    if (query.startDate) {
        conditions.push(gte(plAdjustments.adjustmentDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(plAdjustments.adjustmentDate, query.endDate));
    }

    const result = await db
        .select({
            totalIncome: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.type} = 'income' THEN CAST(${plAdjustments.amount} AS DECIMAL) ELSE 0 END), 0)`,
            totalExpense: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.type} = 'expense' THEN CAST(${plAdjustments.amount} AS DECIMAL) ELSE 0 END), 0)`,
            count: sql<number>`COUNT(*)`,
        })
        .from(plAdjustments)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

    const row = result[0];
    const totalIncome = parseFloat(row?.totalIncome || "0");
    const totalExpense = parseFloat(row?.totalExpense || "0");

    return {
        totalIncome: totalIncome.toFixed(2),
        totalExpense: totalExpense.toFixed(2),
        netAdjustment: (totalIncome - totalExpense).toFixed(2),
        count: Number(row?.count) || 0,
    };
};
