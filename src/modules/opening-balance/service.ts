import { db } from "../../db/config";
import { openingBalances } from "../../db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { UpsertOpeningBalanceInput, GetOpeningBalancesQuery } from "./validation";

export interface OpeningBalance {
    id: number;
    type: string;
    entityId: number | null;
    entityName: string | null;
    amount: string;
    balanceDate: string;
    note: string | null;
}

/**
 * Get all opening balances, optionally filtered by type
 */
export const getOpeningBalances = async (query?: GetOpeningBalancesQuery): Promise<OpeningBalance[]> => {
    const conditions = [];

    if (query?.type) {
        conditions.push(eq(openingBalances.type, query.type));
    }

    const result = await db
        .select()
        .from(openingBalances)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(openingBalances.type, openingBalances.entityName);

    return result.map(r => ({
        id: r.id,
        type: r.type,
        entityId: r.entityId,
        entityName: r.entityName,
        amount: r.amount,
        balanceDate: r.balanceDate,
        note: r.note,
    }));
};

/**
 * Get opening balance for a specific entity
 */
export const getByEntity = async (type: string, entityId: number | null): Promise<OpeningBalance | null> => {
    const conditions = [eq(openingBalances.type, type)];

    if (entityId !== null && entityId !== undefined) {
        conditions.push(eq(openingBalances.entityId, entityId));
    } else {
        conditions.push(sql`${openingBalances.entityId} IS NULL`);
    }

    const result = await db
        .select()
        .from(openingBalances)
        .where(and(...conditions))
        .limit(1);

    if (result.length === 0) return null;

    const r = result[0]!;
    return {
        id: r.id,
        type: r.type,
        entityId: r.entityId,
        entityName: r.entityName,
        amount: r.amount,
        balanceDate: r.balanceDate,
        note: r.note,
    };
};

/**
 * Upsert (insert or update) an opening balance.
 * For per-entity types, uses (type, entityId) as the unique key.
 * For global types (cash, investment, profit_loss), entityId is null.
 */
export const upsertOpeningBalance = async (input: UpsertOpeningBalanceInput): Promise<OpeningBalance> => {
    const entityId = input.entityId ?? null;

    // Check if existing record
    const existing = await getByEntity(input.type, entityId);

    if (existing) {
        // Update
        const [updated] = await db
            .update(openingBalances)
            .set({
                amount: input.amount,
                balanceDate: input.balanceDate,
                entityName: input.entityName ?? existing.entityName,
                note: input.note ?? null,
            })
            .where(eq(openingBalances.id, existing.id))
            .returning();

        return {
            id: updated!.id,
            type: updated!.type,
            entityId: updated!.entityId,
            entityName: updated!.entityName,
            amount: updated!.amount,
            balanceDate: updated!.balanceDate,
            note: updated!.note,
        };
    } else {
        // Insert
        const [created] = await db
            .insert(openingBalances)
            .values({
                type: input.type,
                entityId,
                entityName: input.entityName ?? null,
                amount: input.amount,
                balanceDate: input.balanceDate,
                note: input.note ?? null,
            })
            .returning();

        return {
            id: created!.id,
            type: created!.type,
            entityId: created!.entityId,
            entityName: created!.entityName,
            amount: created!.amount,
            balanceDate: created!.balanceDate,
            note: created!.note,
        };
    }
};

/**
 * Delete an opening balance by ID
 */
export const deleteOpeningBalance = async (id: number): Promise<boolean> => {
    const result = await db
        .delete(openingBalances)
        .where(eq(openingBalances.id, id))
        .returning({ id: openingBalances.id });

    return result.length > 0;
};

/**
 * Get summed opening balances grouped by type (for analytics integration)
 */
export const getOpeningBalanceTotals = async (): Promise<Map<string, number>> => {
    const result = await db
        .select({
            type: openingBalances.type,
            total: sql<string>`COALESCE(SUM(CAST(${openingBalances.amount} AS DECIMAL)), 0)`,
        })
        .from(openingBalances)
        .groupBy(openingBalances.type);

    const map = new Map<string, number>();
    for (const row of result) {
        map.set(row.type, Number(row.total || 0));
    }
    return map;
};
