import { db } from "../../db/config";
import { brand, orderExpenses, sr, srCommissions, wholesaleOrders } from "../../db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { logError } from "../../lib/error-handler";
import type { CreateCommissionInput, GetCommissionsQuery } from "./validation";
import {
    buildDbPointCommissionFilter,
    buildSrCommissionFilter,
    effectiveSrCommissionDate,
} from "./commission-filters";

/**
 * Create a new commission entry for an SR
 */
export async function createCommission(input: CreateCommissionInput) {
    try {
        // Verify SR exists
        const srRecord = await db
            .select()
            .from(sr)
            .where(eq(sr.id, input.srId))
            .limit(1);

        if (srRecord.length === 0) {
            return { success: false, message: "SR not found" };
        }

        const result = await db
            .insert(srCommissions)
            .values({
                srId: input.srId,
                amount: input.amount.toString(),
                commissionDate: input.commissionDate,
                sourceType: "manual",
                note: input.note || null,
            })
            .returning({ id: srCommissions.id });

        return {
            success: true,
            message: "Commission added successfully",
            commissionId: result[0]!.id,
        };
    } catch (error) {
        logError("Error creating SR commission:", error);
        return { success: false, message: "Failed to add commission" };
    }
}

/**
 * Get commissions for an SR with optional date filtering
 */
export async function getCommissions(srId: number, query: GetCommissionsQuery) {
    if (srId === 0) {
        const expenses = await db
            .select({
                id: orderExpenses.id,
                amount: orderExpenses.amount,
                expenseType: orderExpenses.expenseType,
                orderId: orderExpenses.orderId,
                orderNumber: wholesaleOrders.orderNumber,
                note: orderExpenses.note,
                createdAt: orderExpenses.createdAt,
                commissionDate: wholesaleOrders.orderDate,
            })
            .from(orderExpenses)
            .innerJoin(wholesaleOrders, eq(orderExpenses.orderId, wholesaleOrders.id))
            .where(buildDbPointCommissionFilter(query))
            .orderBy(desc(wholesaleOrders.orderDate), desc(orderExpenses.createdAt));

        const commissions = expenses.map((expense) => ({
            id: expense.id,
            srId: null,
            amount: expense.amount,
            commissionDate: expense.commissionDate,
            sourceType: "order_adjustment" as const,
            expenseType: expense.expenseType,
            orderId: expense.orderId,
            orderExpenseId: expense.id,
            orderNumber: expense.orderNumber,
            note: expense.note,
            createdAt: expense.createdAt,
        }));
        const total = commissions.reduce((sum, commission) => sum + parseFloat(commission.amount), 0);

        return {
            commissions,
            total: total.toFixed(2),
            count: commissions.length,
        };
    }

    const commissions = await db
        .select({
            id: srCommissions.id,
            srId: srCommissions.srId,
            amount: srCommissions.amount,
            commissionDate: effectiveSrCommissionDate,
            sourceType: srCommissions.sourceType,
            orderId: srCommissions.orderId,
            orderExpenseId: srCommissions.orderExpenseId,
            orderNumber: wholesaleOrders.orderNumber,
            expenseType: orderExpenses.expenseType,
            note: srCommissions.note,
            createdAt: srCommissions.createdAt,
        })
        .from(srCommissions)
        .leftJoin(wholesaleOrders, eq(srCommissions.orderId, wholesaleOrders.id))
        .leftJoin(orderExpenses, eq(srCommissions.orderExpenseId, orderExpenses.id))
        .where(buildSrCommissionFilter(srId, query))
        .orderBy(desc(effectiveSrCommissionDate), desc(srCommissions.createdAt));

    const total = commissions.reduce((sum, commission) => sum + parseFloat(commission.amount), 0);

    return {
        commissions,
        total: total.toFixed(2),
        count: commissions.length,
    };
}

export interface CommissionIdentityTotal {
    srId: number | null;
    srName: string;
    brandId: number | null;
    brandName: string | null;
    total: string;
}

/**
 * Totals commissions by report identity using the same attribution rules as the ledger.
 * Order-linked entries follow the challan date; manual entries follow their selected date.
 */
export async function getCommissionTotals(
    query: GetCommissionsQuery,
    srId?: number
): Promise<CommissionIdentityTotal[]> {
    const assignedTotals = srId === 0
        ? []
        : await db
            .select({
                srId: srCommissions.srId,
                srName: sr.name,
                brandId: sr.brandId,
                brandName: brand.name,
                total: sql<string>`COALESCE(SUM(CAST(${srCommissions.amount} AS DECIMAL)), 0)`,
            })
            .from(srCommissions)
            .innerJoin(sr, eq(srCommissions.srId, sr.id))
            .leftJoin(brand, eq(sr.brandId, brand.id))
            .leftJoin(wholesaleOrders, eq(srCommissions.orderId, wholesaleOrders.id))
            .where(buildSrCommissionFilter(srId, query))
            .groupBy(srCommissions.srId, sr.name, sr.brandId, brand.name);

    const totals: CommissionIdentityTotal[] = assignedTotals.map((row) => ({
        srId: row.srId,
        srName: row.srName,
        brandId: row.brandId,
        brandName: row.brandName,
        total: row.total,
    }));

    if (srId === undefined || srId === 0) {
        const [dbPointTotal] = await db
            .select({
                total: sql<string>`COALESCE(SUM(CAST(${orderExpenses.amount} AS DECIMAL)), 0)`,
            })
            .from(orderExpenses)
            .innerJoin(wholesaleOrders, eq(orderExpenses.orderId, wholesaleOrders.id))
            .where(buildDbPointCommissionFilter(query));

        const total = parseFloat(dbPointTotal?.total ?? "0");
        if (total > 0) {
            totals.push({
                srId: null,
                srName: "DB Point",
                brandId: null,
                brandName: null,
                total: total.toFixed(2),
            });
        }
    }

    return totals;
}

/**
 * Delete a commission entry
 */
export async function deleteCommission(id: number) {
    try {
        const commission = await db
            .select({
                id: srCommissions.id,
                sourceType: srCommissions.sourceType,
            })
            .from(srCommissions)
            .where(eq(srCommissions.id, id))
            .limit(1);

        if (commission.length === 0) {
            return { success: false, message: "Commission not found", status: 404 };
        }

        if (commission[0]!.sourceType !== "manual") {
            return {
                success: false,
                message: "System-generated commissions must be edited from the order adjustment.",
                status: 400,
            };
        }

        const result = await db
            .delete(srCommissions)
            .where(eq(srCommissions.id, id))
            .returning({ id: srCommissions.id });

        if (result.length === 0) {
            return { success: false, message: "Commission not found", status: 404 };
        }

        return { success: true, message: "Commission deleted successfully" };
    } catch (error) {
        logError("Error deleting SR commission:", error);
        return { success: false, message: "Failed to delete commission", status: 500 };
    }
}
