import { db } from "../../db/config";
import {
    orderCustomerDues,
    orderDsrDues,
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
    GetCollectionHistoryQuery,
    GetDSRDueSummaryQuery,
    GetDSRCollectionHistoryQuery,
    CollectDsrDueInput
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

export interface DSRDueSummary {
    dsrId: number;
    dsrName: string;
    totalOutstanding: string;
    totalCollected: string;
    pendingDuesCount: number;
    ordersWithDuesCount: number;
    dsrDuesAmount: string; // New: DSR dues from adjustments
}

export interface DSRDueDetail {
    dueId: number;
    orderId: number;
    orderNumber: string;
    orderDate: string;
    customerId: number | null;
    customerName: string;
    shopName: string | null;
    originalAmount: string;
    collectedAmount: string;
    remainingDue: string;
}

export interface DSRCollectionRecord {
    id: number;
    orderId: number;
    orderNumber: string;
    orderDate: string;
    customerId: number | null;
    customerName: string;
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

// ==================== DSR DUE TRACKING FUNCTIONS ====================

/**
 * Get DSR due summary - aggregated dues by DSR (the salesman who created the order)
 */
export const getDSRDueSummary = async (
    _query: GetDSRDueSummaryQuery
): Promise<DSRDueSummary[]> => {
    // Get all DSRs with their customer due summaries
    const customerDueResults = await db
        .select({
            dsrId: dsr.id,
            dsrName: dsr.name,
            totalOriginal: sql<string>`COALESCE(SUM(CAST(${orderCustomerDues.amount} AS DECIMAL)), 0)`,
            totalCollected: sql<string>`COALESCE(SUM(CAST(${orderCustomerDues.collectedAmount} AS DECIMAL)), 0)`,
            pendingDuesCount: sql<number>`COUNT(CASE WHEN CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL) > 0 THEN 1 END)`,
            ordersWithDuesCount: sql<number>`COUNT(DISTINCT ${orderCustomerDues.orderId})`,
        })
        .from(dsr)
        .leftJoin(wholesaleOrders, eq(wholesaleOrders.dsrId, dsr.id))
        .leftJoin(orderCustomerDues, eq(orderCustomerDues.orderId, wholesaleOrders.id))
        .groupBy(dsr.id, dsr.name)
        .orderBy(desc(sql`COALESCE(SUM(CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL)), 0)`));

    // Get DSR dues from adjustments (amounts owed by DSRs) - calculate remaining (amount - collected)
    const dsrDueResults = await db
        .select({
            dsrId: orderDsrDues.dsrId,
            totalDsrDues: sql<string>`COALESCE(SUM(CAST(${orderDsrDues.amount} AS DECIMAL) - CAST(COALESCE(${orderDsrDues.collectedAmount}, '0') AS DECIMAL)), 0)`,
        })
        .from(orderDsrDues)
        .groupBy(orderDsrDues.dsrId);

    // Create a map for quick lookup of DSR dues (remaining amounts)
    const dsrDuesMap = new Map<number, string>();
    for (const row of dsrDueResults) {
        // Only include positive remaining amounts
        const remaining = parseFloat(row.totalDsrDues || "0");
        dsrDuesMap.set(row.dsrId, remaining > 0 ? remaining.toFixed(2) : "0.00");
    }

    return customerDueResults.map(row => {
        const totalOriginal = parseFloat(row.totalOriginal || "0");
        const totalCollected = parseFloat(row.totalCollected || "0");
        const totalOutstanding = Math.max(0, totalOriginal - totalCollected);
        const dsrDuesAmount = parseFloat(dsrDuesMap.get(row.dsrId) || "0");

        return {
            dsrId: row.dsrId,
            dsrName: row.dsrName,
            totalOutstanding: totalOutstanding.toFixed(2),
            totalCollected: totalCollected.toFixed(2),
            pendingDuesCount: Number(row.pendingDuesCount) || 0,
            ordersWithDuesCount: Number(row.ordersWithDuesCount) || 0,
            dsrDuesAmount: dsrDuesAmount.toFixed(2),
        };
    });
};

/**
 * Get detailed dues for a specific DSR's orders
 */
export const getDSRDueDetails = async (
    dsrId: number
): Promise<{ dsr: { id: number; name: string }; dues: DSRDueDetail[]; totalOutstanding: string; totalCollected: string }> => {
    // Get DSR info
    const dsrInfo = await db
        .select({ id: dsr.id, name: dsr.name })
        .from(dsr)
        .where(eq(dsr.id, dsrId))
        .limit(1);

    if (!dsrInfo.length) {
        return {
            dsr: { id: dsrId, name: "Unknown" },
            dues: [],
            totalOutstanding: "0.00",
            totalCollected: "0.00"
        };
    }

    // Get ALL dues from orders owned by this DSR (to calculate total collected correctly)
    const allDues = await db
        .select({
            dueId: orderCustomerDues.id,
            orderId: orderCustomerDues.orderId,
            orderNumber: wholesaleOrders.orderNumber,
            orderDate: wholesaleOrders.orderDate,
            customerId: orderCustomerDues.customerId,
            customerName: orderCustomerDues.customerName,
            shopName: customer.shopName,
            originalAmount: orderCustomerDues.amount,
            collectedAmount: orderCustomerDues.collectedAmount,
        })
        .from(orderCustomerDues)
        .innerJoin(wholesaleOrders, eq(orderCustomerDues.orderId, wholesaleOrders.id))
        .leftJoin(customer, eq(orderCustomerDues.customerId, customer.id))
        .where(eq(wholesaleOrders.dsrId, dsrId))
        .orderBy(wholesaleOrders.orderDate);

    // Filter for pending dues only (for display)
    const pendingDues = allDues.filter(due => {
        const remaining = parseFloat(due.originalAmount) - parseFloat(due.collectedAmount);
        return remaining > 0;
    });

    const duesWithRemaining = pendingDues.map(due => ({
        dueId: due.dueId,
        orderId: due.orderId,
        orderNumber: due.orderNumber,
        orderDate: due.orderDate,
        customerId: due.customerId,
        customerName: due.customerName,
        shopName: due.shopName,
        originalAmount: due.originalAmount,
        collectedAmount: due.collectedAmount,
        remainingDue: (parseFloat(due.originalAmount) - parseFloat(due.collectedAmount)).toFixed(2),
    }));

    // Calculate totals from ALL dues (not just pending)
    const totalOutstanding = allDues.reduce(
        (sum, due) => sum + Math.max(0, parseFloat(due.originalAmount) - parseFloat(due.collectedAmount)),
        0
    );

    const totalCollected = allDues.reduce(
        (sum, due) => sum + parseFloat(due.collectedAmount),
        0
    );

    return {
        dsr: dsrInfo[0]!,
        dues: duesWithRemaining,
        totalOutstanding: totalOutstanding.toFixed(2),
        totalCollected: totalCollected.toFixed(2),
    };
};

/**
 * Get collection history for a specific DSR's orders (not collected BY, but orders owned by this DSR)
 */
export const getDSRCollectionHistory = async (
    query: GetDSRCollectionHistoryQuery
): Promise<DSRCollectionRecord[]> => {
    const conditions = [eq(wholesaleOrders.dsrId, query.dsrId)];

    if (query.startDate) {
        conditions.push(gte(dueCollections.collectionDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(dueCollections.collectionDate, query.endDate));
    }

    // First, get the collections with basic info (without collector name to avoid alias issue)
    const results = await db
        .select({
            id: dueCollections.id,
            orderId: dueCollections.orderId,
            orderNumber: wholesaleOrders.orderNumber,
            orderDate: wholesaleOrders.orderDate,
            customerId: dueCollections.customerId,
            customerName: customer.name,
            amount: dueCollections.amount,
            collectionDate: dueCollections.collectionDate,
            paymentMethod: dueCollections.paymentMethod,
            collectedByDsrId: dueCollections.collectedByDsrId,
            note: dueCollections.note,
            createdAt: dueCollections.createdAt,
        })
        .from(dueCollections)
        .innerJoin(wholesaleOrders, eq(dueCollections.orderId, wholesaleOrders.id))
        .leftJoin(customer, eq(dueCollections.customerId, customer.id))
        .where(and(...conditions))
        .orderBy(desc(dueCollections.collectionDate), desc(dueCollections.createdAt));

    // Get all unique collector DSR IDs and fetch their names
    const collectorIds = [...new Set(results.map(r => r.collectedByDsrId).filter(Boolean))] as number[];
    const collectorMap = new Map<number, string>();

    if (collectorIds.length > 0) {
        const collectors = await db
            .select({ id: dsr.id, name: dsr.name })
            .from(dsr)
            .where(sql`${dsr.id} IN (${sql.join(collectorIds.map(id => sql`${id}`), sql`, `)})`);

        for (const c of collectors) {
            collectorMap.set(c.id, c.name);
        }
    }

    return results.map(row => ({
        id: row.id,
        orderId: row.orderId!,
        orderNumber: row.orderNumber,
        orderDate: row.orderDate,
        customerId: row.customerId,
        customerName: row.customerName || "Unknown",
        amount: row.amount,
        collectionDate: row.collectionDate,
        paymentMethod: row.paymentMethod,
        collectedByDsrId: row.collectedByDsrId,
        collectedByDsrName: row.collectedByDsrId ? collectorMap.get(row.collectedByDsrId) || null : null,
        note: row.note,
        createdAt: row.createdAt,
    }));
};

// ==================== DSR DUE COLLECTION ====================

/**
 * Collect DSR's own due (money DSR owes to company from order adjustments)
 */
export const collectDsrDue = async (
    input: CollectDsrDueInput
): Promise<{ success: boolean; message: string }> => {
    const { dsrId, amount, collectionDate, paymentMethod, note, dsrDueId } = input;

    // If specific dsrDueId provided, apply to that due only
    if (dsrDueId) {
        const due = await db
            .select()
            .from(orderDsrDues)
            .where(eq(orderDsrDues.id, dsrDueId))
            .limit(1);

        if (!due.length) {
            return { success: false, message: "DSR due record not found" };
        }

        const dueRecord = due[0]!;
        const collectedAmount = parseFloat(dueRecord.collectedAmount || "0");
        const remaining = parseFloat(dueRecord.amount) - collectedAmount;

        if (amount > remaining) {
            return { success: false, message: `Amount exceeds remaining due of ৳${remaining.toFixed(2)}` };
        }

        // Update collected amount on the DSR due record
        await db
            .update(orderDsrDues)
            .set({
                collectedAmount: (collectedAmount + amount).toFixed(2),
                note: note ? `${dueRecord.note || ""}\n[${collectionDate}] Collected ৳${amount} via ${paymentMethod || "cash"}${note ? ": " + note : ""}` : dueRecord.note,
            })
            .where(eq(orderDsrDues.id, dsrDueId));

        return { success: true, message: `Collected ৳${amount.toFixed(2)} from DSR` };
    }

    // Auto-apply to oldest DSR dues (FIFO)
    let remainingAmount = amount;

    const outstandingDues = await db
        .select({
            id: orderDsrDues.id,
            orderId: orderDsrDues.orderId,
            amount: orderDsrDues.amount,
            collectedAmount: orderDsrDues.collectedAmount,
            note: orderDsrDues.note,
        })
        .from(orderDsrDues)
        .innerJoin(wholesaleOrders, eq(orderDsrDues.orderId, wholesaleOrders.id))
        .where(
            and(
                eq(orderDsrDues.dsrId, dsrId),
                gt(
                    sql`CAST(${orderDsrDues.amount} AS DECIMAL) - CAST(COALESCE(${orderDsrDues.collectedAmount}, '0') AS DECIMAL)`,
                    0
                )
            )
        )
        .orderBy(wholesaleOrders.orderDate);

    if (!outstandingDues.length) {
        return { success: false, message: "No outstanding DSR dues found" };
    }

    for (const due of outstandingDues) {
        if (remainingAmount <= 0) break;

        const collectedSoFar = parseFloat(due.collectedAmount || "0");
        const dueRemaining = parseFloat(due.amount) - collectedSoFar;
        const amountToApply = Math.min(remainingAmount, dueRemaining);

        // Update collected amount on DSR due
        await db
            .update(orderDsrDues)
            .set({
                collectedAmount: (collectedSoFar + amountToApply).toFixed(2),
                note: note ? `${due.note || ""}\n[${collectionDate}] Collected ৳${amountToApply} via ${paymentMethod || "cash"}${note ? ": " + note : ""}` : due.note,
            })
            .where(eq(orderDsrDues.id, due.id));

        remainingAmount -= amountToApply;
    }

    return {
        success: true,
        message: `Collection of ৳${amount.toFixed(2)} recorded successfully`
    };
};
