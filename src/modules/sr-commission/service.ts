import { db } from "../../db/config";
import { orderExpenses, sr, srCommissions, wholesaleOrders } from "../../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { logError } from "../../lib/error-handler";
import type { CreateCommissionInput, GetCommissionsQuery } from "./validation";
import { buildDbPointCommissionFilter } from "./commission-filters";

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
                commissionDate: sql<string>`to_char(${orderExpenses.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD')`,
            })
            .from(orderExpenses)
            .innerJoin(wholesaleOrders, eq(orderExpenses.orderId, wholesaleOrders.id))
            .where(buildDbPointCommissionFilter(query))
            .orderBy(desc(orderExpenses.createdAt));

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

    const conditions = [eq(srCommissions.srId, srId)];

    if (query.startDate) {
        conditions.push(gte(srCommissions.commissionDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(srCommissions.commissionDate, query.endDate));
    }

    const commissions = await db
        .select({
            id: srCommissions.id,
            srId: srCommissions.srId,
            amount: srCommissions.amount,
            commissionDate: srCommissions.commissionDate,
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
        .where(and(...conditions))
        .orderBy(desc(srCommissions.commissionDate), desc(srCommissions.createdAt));

    // Calculate total
    const totalResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(${srCommissions.amount}), 0)`,
        })
        .from(srCommissions)
        .where(and(...conditions));

    const total = parseFloat(totalResult[0]?.total || "0");

    return {
        commissions,
        total: total.toFixed(2),
        count: commissions.length,
    };
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
