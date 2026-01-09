import { db } from "../../db/config";
import {
    orderCustomerDues,
    dueCollections,
    customer,
    wholesaleOrders,
    route,
    dsr
} from "../../db/schema";
import { eq, and, gte, lte, sql, desc, gt } from "drizzle-orm";
import type {
    GetCustomersWithDuesQuery,
    CollectDueInput,
    GetCollectionHistoryQuery
} from "./validation";

// ==================== INTERFACES ====================

export interface CustomerWithDue {
    customerId: number;
    customerName: string;
    shopName: string | null;
    mobile: string | null;
    routeId: number | null;
    routeName: string | null;
    totalDue: string;
    dueCount: number;
    oldestDueDate: string;
}

export interface CustomerDueDetail {
    dueId: number;
    orderId: number;
    orderNumber: string;
    orderDate: string;
    dsrId: number;
    dsrName: string;
    originalAmount: string;
    collectedAmount: string;
    remainingDue: string;
}

export interface CustomerDueDetailsResponse {
    customer: {
        id: number;
        name: string;
        shopName: string | null;
        mobile: string | null;
        routeName: string | null;
    };
    dues: CustomerDueDetail[];
    totalDue: string;
}

export interface CollectionRecord {
    id: number;
    customerId: number | null;
    customerName: string;
    orderId: number | null;
    orderNumber: string | null;
    amount: string;
    collectionDate: string;
    paymentMethod: string | null;
    collectedByDsrId: number | null;
    collectedByDsrName: string | null;
    note: string | null;
    createdAt: Date;
}

// ==================== SERVICE FUNCTIONS ====================

/**
 * Get list of customers with outstanding dues
 */
export const getCustomersWithDues = async (
    _query: GetCustomersWithDuesQuery
): Promise<CustomerWithDue[]> => {
    // Build base query - customers with dues where remaining > 0
    const baseQuery = db
        .select({
            customerId: orderCustomerDues.customerId,
            customerName: orderCustomerDues.customerName,
            shopName: customer.shopName,
            mobile: customer.mobile,
            routeId: customer.routeId,
            routeName: route.name,
            totalDue: sql<string>`SUM(CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL))`,
            dueCount: sql<number>`COUNT(*)`,
            oldestDueDate: sql<string>`MIN(${wholesaleOrders.orderDate})`,
        })
        .from(orderCustomerDues)
        .leftJoin(customer, eq(orderCustomerDues.customerId, customer.id))
        .leftJoin(route, eq(customer.routeId, route.id))
        .leftJoin(wholesaleOrders, eq(orderCustomerDues.orderId, wholesaleOrders.id))
        .where(
            gt(
                sql`CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL)`,
                0
            )
        )
        .groupBy(
            orderCustomerDues.customerId,
            orderCustomerDues.customerName,
            customer.shopName,
            customer.mobile,
            customer.routeId,
            route.name
        )
        .having(
            gt(
                sql`SUM(CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL))`,
                0
            )
        )
        .orderBy(desc(sql`SUM(CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL))`));

    const results = await baseQuery;

    return results.map(row => ({
        customerId: row.customerId || 0,
        customerName: row.customerName,
        shopName: row.shopName,
        mobile: row.mobile,
        routeId: row.routeId,
        routeName: row.routeName,
        totalDue: parseFloat(row.totalDue || "0").toFixed(2),
        dueCount: Number(row.dueCount) || 0,
        oldestDueDate: row.oldestDueDate || "",
    }));
};

/**
 * Get detailed dues for a specific customer
 */
export const getCustomerDueDetails = async (
    customerId: number
): Promise<CustomerDueDetailsResponse | null> => {
    // Get customer info
    const customerInfo = await db
        .select({
            id: customer.id,
            name: customer.name,
            shopName: customer.shopName,
            mobile: customer.mobile,
            routeName: route.name,
        })
        .from(customer)
        .leftJoin(route, eq(customer.routeId, route.id))
        .where(eq(customer.id, customerId))
        .limit(1);

    if (!customerInfo.length) return null;

    // Get outstanding dues
    const dues = await db
        .select({
            dueId: orderCustomerDues.id,
            orderId: orderCustomerDues.orderId,
            orderNumber: wholesaleOrders.orderNumber,
            orderDate: wholesaleOrders.orderDate,
            dsrId: wholesaleOrders.dsrId,
            dsrName: dsr.name,
            originalAmount: orderCustomerDues.amount,
            collectedAmount: orderCustomerDues.collectedAmount,
        })
        .from(orderCustomerDues)
        .innerJoin(wholesaleOrders, eq(orderCustomerDues.orderId, wholesaleOrders.id))
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        .where(
            and(
                eq(orderCustomerDues.customerId, customerId),
                gt(
                    sql`CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL)`,
                    0
                )
            )
        )
        .orderBy(wholesaleOrders.orderDate);

    const duesWithRemaining = dues.map(due => ({
        dueId: due.dueId,
        orderId: due.orderId,
        orderNumber: due.orderNumber,
        orderDate: due.orderDate,
        dsrId: due.dsrId,
        dsrName: due.dsrName,
        originalAmount: due.originalAmount,
        collectedAmount: due.collectedAmount,
        remainingDue: (parseFloat(due.originalAmount) - parseFloat(due.collectedAmount)).toFixed(2),
    }));

    const totalDue = duesWithRemaining.reduce(
        (sum, due) => sum + parseFloat(due.remainingDue),
        0
    );

    const customerData = customerInfo[0];
    if (!customerData) return null;

    return {
        customer: customerData,
        dues: duesWithRemaining,
        totalDue: totalDue.toFixed(2),
    };
};

/**
 * Collect due from customer
 */
export const collectDue = async (
    input: CollectDueInput
): Promise<{ success: boolean; message: string; collectionId?: number }> => {
    const { customerId, amount, collectionDate, paymentMethod, collectedByDsrId, note, dueId } = input;

    // If specific dueId provided, apply to that due only
    if (dueId) {
        const due = await db
            .select()
            .from(orderCustomerDues)
            .where(eq(orderCustomerDues.id, dueId))
            .limit(1);

        if (!due.length) {
            return { success: false, message: "Due not found" };
        }

        const dueRecord = due[0]!;
        const remaining = parseFloat(dueRecord.amount) - parseFloat(dueRecord.collectedAmount);
        if (amount > remaining) {
            return { success: false, message: `Amount exceeds remaining due of ৳${remaining.toFixed(2)}` };
        }

        // Insert collection record
        const collectionResult = await db
            .insert(dueCollections)
            .values({
                customerDueId: dueId,
                customerId,
                orderId: dueRecord.orderId,
                amount: amount.toFixed(2),
                collectionDate,
                paymentMethod,
                collectedByDsrId,
                note,
            })
            .returning({ id: dueCollections.id });

        const collection = collectionResult[0];

        // Update collected amount on the due
        await db
            .update(orderCustomerDues)
            .set({
                collectedAmount: (parseFloat(dueRecord.collectedAmount) + amount).toFixed(2),
            })
            .where(eq(orderCustomerDues.id, dueId));

        return { success: true, message: "Collection recorded", collectionId: collection?.id };
    }

    // Auto-apply to oldest dues (FIFO)
    let remainingAmount = amount;

    const outstandingDues = await db
        .select({
            id: orderCustomerDues.id,
            orderId: orderCustomerDues.orderId,
            amount: orderCustomerDues.amount,
            collectedAmount: orderCustomerDues.collectedAmount,
        })
        .from(orderCustomerDues)
        .innerJoin(wholesaleOrders, eq(orderCustomerDues.orderId, wholesaleOrders.id))
        .where(
            and(
                eq(orderCustomerDues.customerId, customerId),
                gt(
                    sql`CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL)`,
                    0
                )
            )
        )
        .orderBy(wholesaleOrders.orderDate);

    if (!outstandingDues.length) {
        return { success: false, message: "No outstanding dues for this customer" };
    }

    for (const due of outstandingDues) {
        if (remainingAmount <= 0) break;

        const dueRemaining = parseFloat(due.amount) - parseFloat(due.collectedAmount);
        const amountToApply = Math.min(remainingAmount, dueRemaining);

        // Insert collection record
        await db
            .insert(dueCollections)
            .values({
                customerDueId: due.id,
                customerId,
                orderId: due.orderId,
                amount: amountToApply.toFixed(2),
                collectionDate,
                paymentMethod,
                collectedByDsrId,
                note,
            });

        // Update collected amount
        await db
            .update(orderCustomerDues)
            .set({
                collectedAmount: (parseFloat(due.collectedAmount) + amountToApply).toFixed(2),
            })
            .where(eq(orderCustomerDues.id, due.id));

        remainingAmount -= amountToApply;
    }

    return {
        success: true,
        message: `Collection of ৳${amount.toFixed(2)} recorded successfully`
    };
};

/**
 * Get collection history
 */
export const getCollectionHistory = async (
    query: GetCollectionHistoryQuery
): Promise<CollectionRecord[]> => {
    const conditions = [];

    if (query.startDate) {
        conditions.push(gte(dueCollections.collectionDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(dueCollections.collectionDate, query.endDate));
    }
    if (query.customerId) {
        conditions.push(eq(dueCollections.customerId, query.customerId));
    }
    if (query.dsrId) {
        conditions.push(eq(dueCollections.collectedByDsrId, query.dsrId));
    }

    const results = await db
        .select({
            id: dueCollections.id,
            customerId: dueCollections.customerId,
            customerName: customer.name,
            orderId: dueCollections.orderId,
            orderNumber: wholesaleOrders.orderNumber,
            amount: dueCollections.amount,
            collectionDate: dueCollections.collectionDate,
            paymentMethod: dueCollections.paymentMethod,
            collectedByDsrId: dueCollections.collectedByDsrId,
            collectedByDsrName: dsr.name,
            note: dueCollections.note,
            createdAt: dueCollections.createdAt,
        })
        .from(dueCollections)
        .leftJoin(customer, eq(dueCollections.customerId, customer.id))
        .leftJoin(wholesaleOrders, eq(dueCollections.orderId, wholesaleOrders.id))
        .leftJoin(dsr, eq(dueCollections.collectedByDsrId, dsr.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(dueCollections.collectionDate), desc(dueCollections.createdAt));

    return results.map(row => ({
        id: row.id,
        customerId: row.customerId,
        customerName: row.customerName || "Unknown",
        orderId: row.orderId,
        orderNumber: row.orderNumber || null,
        amount: row.amount,
        collectionDate: row.collectionDate,
        paymentMethod: row.paymentMethod,
        collectedByDsrId: row.collectedByDsrId,
        collectedByDsrName: row.collectedByDsrName || null,
        note: row.note,
        createdAt: row.createdAt,
    }));
};
