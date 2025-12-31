import { db } from "../../db/config";
import { wholesaleOrders, dsr, route, orderPayments } from "../../db/schema";
import { eq, and, gte, lte, lt, sql, ne } from "drizzle-orm";
import type { DailySalesCollectionQuery, DsrLedgerQuery } from "./validation";

export interface DailySalesCollectionItem {
    orderNumber: string;
    orderDate: string;
    dsrId: number;
    dsrName: string;
    routeId: number;
    routeName: string;
    totalSale: string;
    returnAmount: string;
    paidAmount: string;
    dueAmount: string;
    status: string;
    paymentStatus: string;
}

export interface DailySalesCollectionSummary {
    totalSales: string;
    totalReturns: string;
    totalReceived: string;
    totalDue: string;
    orderCount: number;
}

export interface DailySalesCollectionResponse {
    items: DailySalesCollectionItem[];
    summary: DailySalesCollectionSummary;
}

/**
 * Get daily sales and collection report
 */
export const getDailySalesCollection = async (
    query: DailySalesCollectionQuery
): Promise<DailySalesCollectionResponse> => {
    // Default to today if no date provided
    const today = new Date().toISOString().split("T")[0];
    const startDate = query.startDate || query.date || today;
    const endDate = query.endDate || query.date || today;

    // Build conditions
    const conditions = [
        gte(wholesaleOrders.orderDate, startDate!),
        lte(wholesaleOrders.orderDate, endDate!),
    ];

    if (query.dsrId) {
        conditions.push(eq(wholesaleOrders.dsrId, query.dsrId));
    }

    if (query.routeId) {
        conditions.push(eq(wholesaleOrders.routeId, query.routeId));
    }

    // Query orders with joins
    const orders = await db
        .select({
            orderNumber: wholesaleOrders.orderNumber,
            orderDate: wholesaleOrders.orderDate,
            dsrId: wholesaleOrders.dsrId,
            dsrName: dsr.name,
            routeId: wholesaleOrders.routeId,
            routeName: route.name,
            total: wholesaleOrders.total,
            paidAmount: wholesaleOrders.paidAmount,
            status: wholesaleOrders.status,
            paymentStatus: wholesaleOrders.paymentStatus,
        })
        .from(wholesaleOrders)
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        .innerJoin(route, eq(wholesaleOrders.routeId, route.id))
        .where(and(...conditions))
        .orderBy(wholesaleOrders.orderDate, dsr.name);

    // Transform data and calculate amounts
    let totalSales = 0;
    let totalReturns = 0;
    let totalReceived = 0;
    let totalDue = 0;

    const items: DailySalesCollectionItem[] = orders.map((order) => {
        const total = parseFloat(order.total);
        const dbPaidAmount = parseFloat(order.paidAmount);
        const isReturn = order.status === "return";
        const isCompleted = order.status === "completed";

        // For returns, the total is considered a return amount
        const saleAmount = isReturn ? 0 : total;
        const returnAmount = isReturn ? total : 0;

        // For completed orders, treat as fully paid even if paidAmount is 0 in DB
        const paidAmount = isCompleted ? total : dbPaidAmount;
        const dueAmount = isCompleted ? 0 : Math.max(0, total - dbPaidAmount);

        // Aggregate totals
        totalSales += saleAmount;
        totalReturns += returnAmount;
        totalReceived += paidAmount;
        totalDue += dueAmount;

        return {
            orderNumber: order.orderNumber,
            orderDate: order.orderDate,
            dsrId: order.dsrId,
            dsrName: order.dsrName,
            routeId: order.routeId,
            routeName: order.routeName,
            totalSale: saleAmount.toFixed(2),
            returnAmount: returnAmount.toFixed(2),
            paidAmount: paidAmount.toFixed(2),
            dueAmount: dueAmount.toFixed(2),
            status: order.status,
            paymentStatus: order.paymentStatus,
        };
    });

    return {
        items,
        summary: {
            totalSales: totalSales.toFixed(2),
            totalReturns: totalReturns.toFixed(2),
            totalReceived: totalReceived.toFixed(2),
            totalDue: totalDue.toFixed(2),
            orderCount: items.length,
        },
    };
};

// ==================== DSR LEDGER ====================

export interface DsrLedgerItem {
    date: string;
    type: "sale" | "payment" | "opening";
    note: string;
    reference: string;
    debit: string;
    credit: string;
    balance: string;
}

export interface DsrLedgerSummary {
    openingBalance: string;
    totalDebit: string;
    totalCredit: string;
    closingBalance: string;
    transactionCount: number;
}

export interface DsrLedgerResponse {
    dsrId: number;
    dsrName: string;
    items: DsrLedgerItem[];
    summary: DsrLedgerSummary;
}

/**
 * Get DSR Ledger - shows all transactions for a DSR with running balance
 * Sales = Debit (DSR owes company)
 * Payments = Credit (DSR paid company)
 */
export const getDsrLedger = async (
    query: DsrLedgerQuery
): Promise<DsrLedgerResponse> => {
    const { dsrId, startDate, endDate } = query;

    // Get DSR info
    const dsrInfo = await db.query.dsr.findFirst({
        where: (d, { eq }) => eq(d.id, dsrId),
    });

    if (!dsrInfo) {
        throw new Error(`DSR with ID ${dsrId} not found`);
    }

    // Calculate opening balance (sum of debits - credits before start date)
    // Debits: Sales before start date (excluding cancelled/return)
    const salesBeforeResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(CAST(${wholesaleOrders.total} AS DECIMAL)), 0)`,
        })
        .from(wholesaleOrders)
        .where(and(
            eq(wholesaleOrders.dsrId, dsrId),
            lt(wholesaleOrders.orderDate, startDate),
            ne(wholesaleOrders.status, "cancelled"),
            ne(wholesaleOrders.status, "return")
        ));

    // Credits: Payments before start date
    const paymentsBeforeResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(CAST(${orderPayments.amount} AS DECIMAL)), 0)`,
        })
        .from(orderPayments)
        .innerJoin(wholesaleOrders, eq(orderPayments.orderId, wholesaleOrders.id))
        .where(and(
            eq(wholesaleOrders.dsrId, dsrId),
            lt(orderPayments.paymentDate, startDate)
        ));

    const salesBefore = parseFloat(salesBeforeResult[0]?.total || "0");
    const paymentsBefore = parseFloat(paymentsBeforeResult[0]?.total || "0");
    const openingBalance = salesBefore - paymentsBefore;

    // Get sales in date range (excluding cancelled/return)
    const sales = await db
        .select({
            date: wholesaleOrders.orderDate,
            orderNumber: wholesaleOrders.orderNumber,
            total: wholesaleOrders.total,
            routeName: route.name,
        })
        .from(wholesaleOrders)
        .innerJoin(route, eq(wholesaleOrders.routeId, route.id))
        .where(and(
            eq(wholesaleOrders.dsrId, dsrId),
            gte(wholesaleOrders.orderDate, startDate),
            lte(wholesaleOrders.orderDate, endDate),
            ne(wholesaleOrders.status, "cancelled"),
            ne(wholesaleOrders.status, "return")
        ));

    // Get payments in date range
    const payments = await db
        .select({
            date: orderPayments.paymentDate,
            amount: orderPayments.amount,
            note: orderPayments.note,
            paymentMethod: orderPayments.paymentMethod,
            orderNumber: wholesaleOrders.orderNumber,
        })
        .from(orderPayments)
        .innerJoin(wholesaleOrders, eq(orderPayments.orderId, wholesaleOrders.id))
        .where(and(
            eq(wholesaleOrders.dsrId, dsrId),
            gte(orderPayments.paymentDate, startDate),
            lte(orderPayments.paymentDate, endDate)
        ));

    // Combine and sort transactions
    interface Transaction {
        date: string;
        type: "sale" | "payment";
        note: string;
        reference: string;
        debit: number;
        credit: number;
        sortKey: string;
    }

    const transactions: Transaction[] = [];

    // Add sales as debits
    for (const sale of sales) {
        transactions.push({
            date: sale.date,
            type: "sale",
            note: `Sale - ${sale.routeName}`,
            reference: sale.orderNumber,
            debit: parseFloat(sale.total),
            credit: 0,
            sortKey: `${sale.date}-0-${sale.orderNumber}`,
        });
    }

    // Add payments as credits
    for (const payment of payments) {
        transactions.push({
            date: payment.date,
            type: "payment",
            note: payment.note || `Payment - ${payment.paymentMethod || "Cash"}`,
            reference: payment.orderNumber,
            debit: 0,
            credit: parseFloat(payment.amount),
            sortKey: `${payment.date}-1-${payment.orderNumber}`,
        });
    }

    // Sort by date, then type (sales before payments on same day)
    transactions.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Build ledger items with running balance
    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const items: DsrLedgerItem[] = [];

    // Add opening balance row
    items.push({
        date: startDate,
        type: "opening",
        note: "Opening Balance",
        reference: "",
        debit: "0.00",
        credit: "0.00",
        balance: openingBalance.toFixed(2),
    });

    // Add transaction rows
    for (const tx of transactions) {
        runningBalance = runningBalance + tx.debit - tx.credit;
        totalDebit += tx.debit;
        totalCredit += tx.credit;

        items.push({
            date: tx.date,
            type: tx.type,
            note: tx.note,
            reference: tx.reference,
            debit: tx.debit > 0 ? tx.debit.toFixed(2) : "0.00",
            credit: tx.credit > 0 ? tx.credit.toFixed(2) : "0.00",
            balance: runningBalance.toFixed(2),
        });
    }

    return {
        dsrId,
        dsrName: dsrInfo.name,
        items,
        summary: {
            openingBalance: openingBalance.toFixed(2),
            totalDebit: totalDebit.toFixed(2),
            totalCredit: totalCredit.toFixed(2),
            closingBalance: runningBalance.toFixed(2),
            transactionCount: transactions.length,
        },
    };
};
