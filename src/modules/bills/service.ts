import { db } from "../../db/config";
import { bills } from "../../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { CreateBillInput, GetBillsQuery } from "./validation";

export interface Bill {
    id: number;
    title: string;
    amount: string;
    note: string | null;
    billDate: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface BillsSummary {
    totalAmount: string;
    billCount: number;
}

/**
 * Get all bills with optional date filtering
 */
export const getBills = async (query: GetBillsQuery): Promise<Bill[]> => {
    const conditions = [];

    if (query.startDate) {
        conditions.push(gte(bills.billDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(bills.billDate, query.endDate));
    }

    const result = await db
        .select()
        .from(bills)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(bills.billDate), desc(bills.createdAt));

    return result;
};

/**
 * Create a new bill
 */
export const createBill = async (input: CreateBillInput): Promise<Bill> => {
    const [newBill] = await db
        .insert(bills)
        .values({
            title: input.title,
            amount: input.amount,
            note: input.note || null,
            billDate: input.billDate,
        })
        .returning();

    return newBill!;
};

/**
 * Delete a bill by ID
 */
export const deleteBill = async (id: number): Promise<boolean> => {
    const result = await db
        .delete(bills)
        .where(eq(bills.id, id))
        .returning({ id: bills.id });

    return result.length > 0;
};

/**
 * Get bills summary (total amount and count) for a date range
 */
export const getBillsSummary = async (query: GetBillsQuery): Promise<BillsSummary> => {
    const conditions = [];

    if (query.startDate) {
        conditions.push(gte(bills.billDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(bills.billDate, query.endDate));
    }

    const result = await db
        .select({
            totalAmount: sql<string>`COALESCE(SUM(CAST(${bills.amount} AS DECIMAL)), 0)`,
            billCount: sql<number>`COUNT(*)`,
        })
        .from(bills)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

    const row = result[0];
    return {
        totalAmount: parseFloat(row?.totalAmount || "0").toFixed(2),
        billCount: Number(row?.billCount) || 0,
    };
};
