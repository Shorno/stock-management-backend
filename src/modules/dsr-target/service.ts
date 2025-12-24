import { db } from "../../db/config";
import { dsrTarget, dsr, wholesaleOrders } from "../../db/schema";
import { eq, and, gte, lt, sum } from "drizzle-orm";

export interface CreateDsrTargetInput {
    dsrId: number;
    targetMonth: string; // YYYY-MM-DD format (first of month)
    targetAmount: string;
}

export interface UpdateDsrTargetInput {
    targetAmount?: string;
}

export interface DsrTargetWithProgress {
    id: number;
    dsrId: number;
    dsrName: string;
    targetMonth: string;
    targetAmount: number;
    actualSales: number;
    progress: number; // percentage
}

export async function getAllTargets() {
    const results = await db
        .select({
            id: dsrTarget.id,
            dsrId: dsrTarget.dsrId,
            dsrName: dsr.name,
            targetMonth: dsrTarget.targetMonth,
            targetAmount: dsrTarget.targetAmount,
            createdAt: dsrTarget.createdAt,
            updatedAt: dsrTarget.updatedAt,
        })
        .from(dsrTarget)
        .innerJoin(dsr, eq(dsrTarget.dsrId, dsr.id))
        .orderBy(dsrTarget.targetMonth);

    return results;
}

export async function getTargetById(id: number) {
    const result = await db
        .select({
            id: dsrTarget.id,
            dsrId: dsrTarget.dsrId,
            dsrName: dsr.name,
            targetMonth: dsrTarget.targetMonth,
            targetAmount: dsrTarget.targetAmount,
        })
        .from(dsrTarget)
        .innerJoin(dsr, eq(dsrTarget.dsrId, dsr.id))
        .where(eq(dsrTarget.id, id));

    return result[0] || null;
}

export async function createTarget(data: CreateDsrTargetInput) {
    // Check if target already exists for this DSR and month
    const existing = await db
        .select()
        .from(dsrTarget)
        .where(
            and(
                eq(dsrTarget.dsrId, data.dsrId),
                eq(dsrTarget.targetMonth, data.targetMonth)
            )
        );

    if (existing.length > 0) {
        // Update existing target
        const updated = await db
            .update(dsrTarget)
            .set({ targetAmount: data.targetAmount })
            .where(eq(dsrTarget.id, existing[0]!.id))
            .returning();
        return updated[0];
    }

    // Create new target
    const result = await db
        .insert(dsrTarget)
        .values({
            dsrId: data.dsrId,
            targetMonth: data.targetMonth,
            targetAmount: data.targetAmount,
        })
        .returning();

    return result[0];
}

export async function updateTarget(id: number, data: UpdateDsrTargetInput) {
    const result = await db
        .update(dsrTarget)
        .set(data)
        .where(eq(dsrTarget.id, id))
        .returning();

    return result[0] || null;
}

export async function deleteTarget(id: number) {
    const result = await db
        .delete(dsrTarget)
        .where(eq(dsrTarget.id, id))
        .returning();

    return result.length > 0;
}

export async function getTargetsWithProgress(targetMonth?: string): Promise<DsrTargetWithProgress[]> {
    // Default to current month if not specified
    const month = targetMonth || new Date().toISOString().slice(0, 7) + "-01";

    // Calculate start and end of month
    const startDate = month;
    const monthDate = new Date(month);
    const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
        .toISOString()
        .split("T")[0]!;

    // Get all targets for the month
    const targets = await db
        .select({
            id: dsrTarget.id,
            dsrId: dsrTarget.dsrId,
            dsrName: dsr.name,
            targetMonth: dsrTarget.targetMonth,
            targetAmount: dsrTarget.targetAmount,
        })
        .from(dsrTarget)
        .innerJoin(dsr, eq(dsrTarget.dsrId, dsr.id))
        .where(eq(dsrTarget.targetMonth, month));

    // Get actual sales for each DSR in the month (separate query)
    const salesByDsr = await db
        .select({
            dsrId: wholesaleOrders.dsrId,
            totalSales: sum(wholesaleOrders.total),
        })
        .from(wholesaleOrders)
        .where(
            and(
                eq(wholesaleOrders.status, 'completed'),
                gte(wholesaleOrders.orderDate, startDate),
                lt(wholesaleOrders.orderDate, endDate)
            )
        )
        .groupBy(wholesaleOrders.dsrId);

    // Create a map of dsrId -> totalSales
    const salesMap = new Map<number, number>();
    for (const sale of salesByDsr) {
        salesMap.set(sale.dsrId, Number(sale.totalSales || 0));
    }

    // Combine targets with actual sales
    return targets.map(t => {
        const actualSales = salesMap.get(t.dsrId) || 0;
        const targetAmount = Number(t.targetAmount);
        return {
            id: t.id,
            dsrId: t.dsrId,
            dsrName: t.dsrName,
            targetMonth: t.targetMonth,
            targetAmount,
            actualSales,
            progress: targetAmount > 0
                ? Math.min(100, Math.round((actualSales / targetAmount) * 100))
                : 0,
        };
    });
}

export async function getCurrentMonthTargets(): Promise<DsrTargetWithProgress[]> {
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    return getTargetsWithProgress(currentMonth);
}
