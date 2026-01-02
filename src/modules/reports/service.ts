import { db } from "../../db/config";
import { wholesaleOrders, dsr, route, orderPayments } from "../../db/schema";
import { eq, and, gte, lte, lt, sql, ne, sum, countDistinct, desc } from "drizzle-orm";
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

// ==================== DSR LEDGER OVERVIEW ====================

export interface DsrLedgerOverviewItem {
    dsrId: number;
    dsrName: string;
    openingBalance: string;
    totalDebit: string;
    totalCredit: string;
    closingBalance: string;
    transactionCount: number;
}

export interface DsrLedgerOverviewResponse {
    items: DsrLedgerOverviewItem[];
    totals: {
        totalOpeningBalance: string;
        totalDebit: string;
        totalCredit: string;
        totalClosingBalance: string;
    };
}

export interface DsrLedgerOverviewQuery {
    startDate: string;
    endDate: string;
}

/**
 * Get DSR Ledger Overview - shows summary for all DSRs
 */
export const getAllDsrLedgerSummaries = async (
    query: DsrLedgerOverviewQuery
): Promise<DsrLedgerOverviewResponse> => {
    const { startDate, endDate } = query;

    // Get all DSRs
    const allDsrs = await db.query.dsr.findMany({
        orderBy: (d, { asc }) => asc(d.name),
    });

    const items: DsrLedgerOverviewItem[] = [];
    let totalOpeningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let totalClosingBalance = 0;

    for (const dsrInfo of allDsrs) {
        // Calculate opening balance (sales - payments before start date)
        const salesBeforeResult = await db
            .select({
                total: sql<string>`COALESCE(SUM(CAST(${wholesaleOrders.total} AS DECIMAL)), 0)`,
            })
            .from(wholesaleOrders)
            .where(and(
                eq(wholesaleOrders.dsrId, dsrInfo.id),
                lt(wholesaleOrders.orderDate, startDate),
                ne(wholesaleOrders.status, "cancelled"),
                ne(wholesaleOrders.status, "return")
            ));

        const paymentsBeforeResult = await db
            .select({
                total: sql<string>`COALESCE(SUM(CAST(${orderPayments.amount} AS DECIMAL)), 0)`,
            })
            .from(orderPayments)
            .innerJoin(wholesaleOrders, eq(orderPayments.orderId, wholesaleOrders.id))
            .where(and(
                eq(wholesaleOrders.dsrId, dsrInfo.id),
                lt(orderPayments.paymentDate, startDate)
            ));

        const salesBefore = parseFloat(salesBeforeResult[0]?.total || "0");
        const paymentsBefore = parseFloat(paymentsBeforeResult[0]?.total || "0");
        const openingBalance = salesBefore - paymentsBefore;

        // Get sales in date range (debit)
        const salesInRangeResult = await db
            .select({
                total: sql<string>`COALESCE(SUM(CAST(${wholesaleOrders.total} AS DECIMAL)), 0)`,
                count: sql<number>`COUNT(*)`,
            })
            .from(wholesaleOrders)
            .where(and(
                eq(wholesaleOrders.dsrId, dsrInfo.id),
                gte(wholesaleOrders.orderDate, startDate),
                lte(wholesaleOrders.orderDate, endDate),
                ne(wholesaleOrders.status, "cancelled"),
                ne(wholesaleOrders.status, "return")
            ));

        // Get payments in date range (credit)
        const paymentsInRangeResult = await db
            .select({
                total: sql<string>`COALESCE(SUM(CAST(${orderPayments.amount} AS DECIMAL)), 0)`,
                count: sql<number>`COUNT(*)`,
            })
            .from(orderPayments)
            .innerJoin(wholesaleOrders, eq(orderPayments.orderId, wholesaleOrders.id))
            .where(and(
                eq(wholesaleOrders.dsrId, dsrInfo.id),
                gte(orderPayments.paymentDate, startDate),
                lte(orderPayments.paymentDate, endDate)
            ));

        const debit = parseFloat(salesInRangeResult[0]?.total || "0");
        const credit = parseFloat(paymentsInRangeResult[0]?.total || "0");
        const salesCount = Number(salesInRangeResult[0]?.count || 0);
        const paymentsCount = Number(paymentsInRangeResult[0]?.count || 0);
        const closingBalance = openingBalance + debit - credit;

        items.push({
            dsrId: dsrInfo.id,
            dsrName: dsrInfo.name,
            openingBalance: openingBalance.toFixed(2),
            totalDebit: debit.toFixed(2),
            totalCredit: credit.toFixed(2),
            closingBalance: closingBalance.toFixed(2),
            transactionCount: salesCount + paymentsCount,
        });

        totalOpeningBalance += openingBalance;
        totalDebit += debit;
        totalCredit += credit;
        totalClosingBalance += closingBalance;
    }

    return {
        items,
        totals: {
            totalOpeningBalance: totalOpeningBalance.toFixed(2),
            totalDebit: totalDebit.toFixed(2),
            totalCredit: totalCredit.toFixed(2),
            totalClosingBalance: totalClosingBalance.toFixed(2),
        },
    };
};

// ==================== DSR DUE SUMMARY ====================

export interface DsrDueSummaryItem {
    dsrId: number;
    dsrName: string;
    orderCount: number;
    totalOrderAmount: string;
    totalPaid: string;
    totalDue: string;
    oldestDueDate: string | null;
    dueAgeDays: number;
}

export interface DsrDueSummaryResponse {
    items: DsrDueSummaryItem[];
    totals: {
        totalDsrs: number;
        totalOrders: number;
        grandTotalDue: string;
        averageAgeDays: number;
    };
}

/**
 * Get DSR Due Summary - shows all DSRs with outstanding dues
 */
export const getDsrDueSummary = async (): Promise<DsrDueSummaryResponse> => {
    const today = new Date();

    // Get all orders with dues (unpaid or partial payment, excluding cancelled/return/completed)
    const ordersWithDues = await db
        .select({
            dsrId: wholesaleOrders.dsrId,
            dsrName: dsr.name,
            orderDate: wholesaleOrders.orderDate,
            total: wholesaleOrders.total,
            paidAmount: wholesaleOrders.paidAmount,
            status: wholesaleOrders.status,
            paymentStatus: wholesaleOrders.paymentStatus,
        })
        .from(wholesaleOrders)
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        .where(and(
            ne(wholesaleOrders.status, "cancelled"),
            ne(wholesaleOrders.status, "return"),
            ne(wholesaleOrders.status, "completed"),
            ne(wholesaleOrders.paymentStatus, "paid")
        ))
        .orderBy(dsr.name, wholesaleOrders.orderDate);

    // Group by DSR
    const dsrMap = new Map<number, {
        dsrName: string;
        orders: Array<{
            orderDate: string;
            total: number;
            paidAmount: number;
        }>;
    }>();

    for (const order of ordersWithDues) {
        const existing = dsrMap.get(order.dsrId);
        const orderData = {
            orderDate: order.orderDate,
            total: parseFloat(order.total),
            paidAmount: parseFloat(order.paidAmount),
        };

        if (existing) {
            existing.orders.push(orderData);
        } else {
            dsrMap.set(order.dsrId, {
                dsrName: order.dsrName ?? "",
                orders: [orderData],
            });
        }
    }

    // Build summary items
    const items: DsrDueSummaryItem[] = [];
    let grandTotalDue = 0;
    let totalAgeDays = 0;
    let totalOrders = 0;

    for (const [dsrId, data] of dsrMap) {
        let totalOrderAmount = 0;
        let totalPaid = 0;
        let oldestDate: Date | null = null;

        for (const order of data.orders) {
            totalOrderAmount += order.total;
            totalPaid += order.paidAmount;

            const orderDate = new Date(order.orderDate);
            if (!oldestDate || orderDate < oldestDate) {
                oldestDate = orderDate;
            }
        }

        const due = totalOrderAmount - totalPaid;
        const ageDays = oldestDate
            ? Math.floor((today.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        items.push({
            dsrId,
            dsrName: data.dsrName,
            orderCount: data.orders.length,
            totalOrderAmount: totalOrderAmount.toFixed(2),
            totalPaid: totalPaid.toFixed(2),
            totalDue: due.toFixed(2),
            oldestDueDate: (oldestDate !== null ? oldestDate.toISOString().split("T")[0] : null) as string | null,
            dueAgeDays: ageDays,
        });

        grandTotalDue += due;
        totalAgeDays += ageDays;
        totalOrders += data.orders.length;
    }

    // Sort by due amount descending (prioritize high-value collections)
    items.sort((a, b) => parseFloat(b.totalDue) - parseFloat(a.totalDue));

    return {
        items,
        totals: {
            totalDsrs: items.length,
            totalOrders,
            grandTotalDue: grandTotalDue.toFixed(2),
            averageAgeDays: items.length > 0 ? Math.round(totalAgeDays / items.length) : 0,
        },
    };
};

// Import additional schemas for product-wise-sales
import { wholesaleOrderItems, category, brand, product } from "../../db/schema";
import type { ProductWiseSalesQuery } from "./validation";

export interface ProductWiseSalesItem {
    productId: number;
    productName: string;
    categoryId: number | null;
    categoryName: string | null;
    brandId: number;
    brandName: string;
    unit: string;
    totalQuantity: number;
    freeQuantity: number;
    totalSales: string;
    averagePrice: string;
    orderCount: number;
}

export interface ProductWiseSalesSummary {
    totalProducts: number;
    totalQuantitySold: number;
    totalFreeQuantity: number;
    grandTotal: string;
}

export interface ProductWiseSalesResponse {
    items: ProductWiseSalesItem[];
    summary: ProductWiseSalesSummary;
}

/**
 * Get product-wise sales report
 */
export const getProductWiseSales = async (
    query: ProductWiseSalesQuery
): Promise<ProductWiseSalesResponse> => {
    // Build base conditions for orders
    const orderConditions = [
        gte(wholesaleOrders.orderDate, query.startDate),
        lte(wholesaleOrders.orderDate, query.endDate),
        ne(wholesaleOrders.status, "cancelled"),
        ne(wholesaleOrders.status, "return"),
    ];

    if (query.dsrId) {
        orderConditions.push(eq(wholesaleOrders.dsrId, query.dsrId));
    }

    if (query.routeId) {
        orderConditions.push(eq(wholesaleOrders.routeId, query.routeId));
    }

    // Build item conditions
    const itemConditions: any[] = [];

    if (query.categoryId) {
        itemConditions.push(eq(product.categoryId, query.categoryId));
    }

    if (query.brandId) {
        itemConditions.push(eq(wholesaleOrderItems.brandId, query.brandId));
    }

    if (query.productId) {
        itemConditions.push(eq(wholesaleOrderItems.productId, query.productId));
    }

    // Query order items grouped by product
    const results = await db
        .select({
            productId: wholesaleOrderItems.productId,
            productName: product.name,
            categoryId: product.categoryId,
            categoryName: category.name,
            brandId: wholesaleOrderItems.brandId,
            brandName: brand.name,
            unit: wholesaleOrderItems.unit,
            quantity: sql<number>`SUM(COALESCE(${wholesaleOrderItems.deliveredQuantity}, ${wholesaleOrderItems.quantity}))`,
            freeQty: sql<number>`SUM(COALESCE(${wholesaleOrderItems.deliveredFreeQty}, ${wholesaleOrderItems.freeQuantity}))`,
            totalNet: sum(wholesaleOrderItems.net),
            orderCount: countDistinct(wholesaleOrderItems.orderId),
        })
        .from(wholesaleOrderItems)
        .innerJoin(wholesaleOrders, eq(wholesaleOrderItems.orderId, wholesaleOrders.id))
        .innerJoin(product, eq(wholesaleOrderItems.productId, product.id))
        .leftJoin(category, eq(product.categoryId, category.id))
        .innerJoin(brand, eq(wholesaleOrderItems.brandId, brand.id))
        .where(and(...orderConditions, ...(itemConditions.length > 0 ? itemConditions : [])))
        .groupBy(
            wholesaleOrderItems.productId,
            product.name,
            product.categoryId,
            category.name,
            wholesaleOrderItems.brandId,
            brand.name,
            wholesaleOrderItems.unit
        )
        .orderBy(desc(sum(wholesaleOrderItems.net)));

    // Transform and calculate
    let totalQuantitySold = 0;
    let totalFreeQuantity = 0;
    let grandTotal = 0;

    const items: ProductWiseSalesItem[] = results.map((row) => {
        const quantity = Number(row.quantity) || 0;
        const freeQty = Number(row.freeQty) || 0;
        const net = parseFloat(row.totalNet ?? "0") || 0;
        const avgPrice = quantity > 0 ? net / quantity : 0;

        totalQuantitySold += quantity;
        totalFreeQuantity += freeQty;
        grandTotal += net;

        return {
            productId: row.productId,
            productName: row.productName,
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            brandId: row.brandId,
            brandName: row.brandName,
            unit: row.unit,
            totalQuantity: quantity,
            freeQuantity: freeQty,
            totalSales: net.toFixed(2),
            averagePrice: avgPrice.toFixed(2),
            orderCount: row.orderCount,
        };
    });

    return {
        items,
        summary: {
            totalProducts: items.length,
            totalQuantitySold,
            totalFreeQuantity,
            grandTotal: grandTotal.toFixed(2),
        },
    };
};

// ==================== BRAND WISE SALES ====================

import type { BrandWiseSalesQuery } from "./validation";

export interface BrandWiseSalesItem {
    brandId: number;
    brandName: string;
    totalQuantity: number;
    freeQuantity: number;
    totalSales: string;
    orderCount: number;
    productCount: number;
}

export interface BrandWiseSalesSummary {
    totalBrands: number;
    totalQuantitySold: number;
    totalFreeQuantity: number;
    grandTotal: string;
}

export interface BrandWiseSalesResponse {
    items: BrandWiseSalesItem[];
    summary: BrandWiseSalesSummary;
}

/**
 * Get brand-wise sales report
 * If no date filters provided, returns all sales
 */
export const getBrandWiseSales = async (
    query: BrandWiseSalesQuery
): Promise<BrandWiseSalesResponse> => {
    // Build conditions for orders
    const orderConditions = [
        ne(wholesaleOrders.status, "cancelled"),
        ne(wholesaleOrders.status, "return"),
    ];

    // Add date filters if provided
    if (query.startDate) {
        orderConditions.push(gte(wholesaleOrders.orderDate, query.startDate));
    }
    if (query.endDate) {
        orderConditions.push(lte(wholesaleOrders.orderDate, query.endDate));
    }

    // Query order items grouped by brand
    const results = await db
        .select({
            brandId: wholesaleOrderItems.brandId,
            brandName: brand.name,
            quantity: sql<number>`SUM(COALESCE(${wholesaleOrderItems.deliveredQuantity}, ${wholesaleOrderItems.quantity}))`,
            freeQty: sql<number>`SUM(COALESCE(${wholesaleOrderItems.deliveredFreeQty}, ${wholesaleOrderItems.freeQuantity}))`,
            totalNet: sum(wholesaleOrderItems.net),
            orderCount: countDistinct(wholesaleOrderItems.orderId),
            productCount: countDistinct(wholesaleOrderItems.productId),
        })
        .from(wholesaleOrderItems)
        .innerJoin(wholesaleOrders, eq(wholesaleOrderItems.orderId, wholesaleOrders.id))
        .innerJoin(brand, eq(wholesaleOrderItems.brandId, brand.id))
        .where(and(...orderConditions))
        .groupBy(wholesaleOrderItems.brandId, brand.name)
        .orderBy(desc(sum(wholesaleOrderItems.net)));

    // Transform and calculate
    let totalQuantitySold = 0;
    let totalFreeQuantity = 0;
    let grandTotal = 0;

    const items: BrandWiseSalesItem[] = results.map((row) => {
        const quantity = Number(row.quantity) || 0;
        const freeQty = Number(row.freeQty) || 0;
        const net = parseFloat(row.totalNet ?? "0") || 0;

        totalQuantitySold += quantity;
        totalFreeQuantity += freeQty;
        grandTotal += net;

        return {
            brandId: row.brandId,
            brandName: row.brandName,
            totalQuantity: quantity,
            freeQuantity: freeQty,
            totalSales: net.toFixed(2),
            orderCount: row.orderCount,
            productCount: row.productCount,
        };
    });

    return {
        items,
        summary: {
            totalBrands: items.length,
            totalQuantitySold,
            totalFreeQuantity,
            grandTotal: grandTotal.toFixed(2),
        },
    };
};
