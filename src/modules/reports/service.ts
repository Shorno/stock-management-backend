import { db } from "../../db/config";
import { wholesaleOrders, dsr, route } from "../../db/schema";
import { eq, and, gte, lte, sql, ne, sum, countDistinct, desc } from "drizzle-orm";
import type { DailySalesCollectionQuery, DsrLedgerQuery, DailySettlementQuery } from "./validation";

export interface DailySalesCollectionItem {
    orderDate: string;
    dsrId: number;
    dsrName: string;
    routeId: number;
    routeName: string;
    sale: string;           // Original order total
    returnAmount: string;   // Sum of item returns
    discount: string;       // Order discount
    grandTotal: string;     // sale - returns - discount
    expense: string;        // Sum of expenses
    received: string;       // Sum of payments
    due: string;            // grandTotal - received
}

export interface DailySalesCollectionSummary {
    totalSales: string;
    totalReturns: string;
    totalDiscount: string;
    totalGrandTotal: string;
    totalExpenses: string;
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
 * Uses adjustment data (expenses, returns, payments) as source of truth
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
        ne(wholesaleOrders.status, "cancelled"),
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
            orderId: wholesaleOrders.id,
            orderDate: wholesaleOrders.orderDate,
            dsrId: wholesaleOrders.dsrId,
            dsrName: dsr.name,
            routeId: wholesaleOrders.routeId,
            routeName: route.name,
            total: wholesaleOrders.total,
            discount: wholesaleOrders.discount,
        })
        .from(wholesaleOrders)
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        .innerJoin(route, eq(wholesaleOrders.routeId, route.id))
        .where(and(...conditions))
        .orderBy(wholesaleOrders.orderDate, dsr.name);

    // Get all order IDs for batch queries
    const orderIds = orders.map(o => o.orderId);

    // Fetch all payments, expenses, and returns for these orders
    const allPayments = orderIds.length > 0 ? await db.query.orderPayments.findMany({
        where: (p, { inArray }) => inArray(p.orderId, orderIds),
    }) : [];

    const allExpenses = orderIds.length > 0 ? await db.query.orderExpenses.findMany({
        where: (e, { inArray }) => inArray(e.orderId, orderIds),
    }) : [];

    const allReturns = orderIds.length > 0 ? await db.query.orderItemReturns.findMany({
        where: (r, { inArray }) => inArray(r.orderId, orderIds),
    }) : [];

    // Group by order ID for quick lookup
    const paymentsByOrder = new Map<number, number>();
    for (const p of allPayments) {
        paymentsByOrder.set(p.orderId, (paymentsByOrder.get(p.orderId) || 0) + parseFloat(p.amount));
    }

    const expensesByOrder = new Map<number, number>();
    for (const e of allExpenses) {
        expensesByOrder.set(e.orderId, (expensesByOrder.get(e.orderId) || 0) + parseFloat(e.amount));
    }

    const returnsByOrder = new Map<number, number>();
    for (const r of allReturns) {
        returnsByOrder.set(r.orderId, (returnsByOrder.get(r.orderId) || 0) + parseFloat(r.returnAmount));
    }

    // Transform data and calculate amounts
    let totalSales = 0;
    let totalReturns = 0;
    let totalDiscount = 0;
    let totalGrandTotal = 0;
    let totalExpenses = 0;
    let totalReceived = 0;
    let totalDue = 0;

    const items: DailySalesCollectionItem[] = orders.map((order) => {
        const sale = parseFloat(order.total);
        const discount = parseFloat(order.discount);
        const returnAmount = returnsByOrder.get(order.orderId) || 0;
        const expense = expensesByOrder.get(order.orderId) || 0;
        const received = paymentsByOrder.get(order.orderId) || 0;

        // Grand Total = Sale - Returns - Discount
        const grandTotal = sale - returnAmount;
        // Due = Grand Total - Received
        const due = Math.max(0, grandTotal - received);

        // Aggregate totals
        totalSales += sale;
        totalReturns += returnAmount;
        totalDiscount += discount;
        totalGrandTotal += grandTotal;
        totalExpenses += expense;
        totalReceived += received;
        totalDue += due;

        return {
            orderDate: order.orderDate,
            dsrId: order.dsrId,
            dsrName: order.dsrName,
            routeId: order.routeId,
            routeName: order.routeName,
            sale: sale.toFixed(2),
            returnAmount: returnAmount.toFixed(2),
            discount: discount.toFixed(2),
            grandTotal: grandTotal.toFixed(2),
            expense: expense.toFixed(2),
            received: received.toFixed(2),
            due: due.toFixed(2),
        };
    });

    return {
        items,
        summary: {
            totalSales: totalSales.toFixed(2),
            totalReturns: totalReturns.toFixed(2),
            totalDiscount: totalDiscount.toFixed(2),
            totalGrandTotal: totalGrandTotal.toFixed(2),
            totalExpenses: totalExpenses.toFixed(2),
            totalReceived: totalReceived.toFixed(2),
            totalDue: totalDue.toFixed(2),
            orderCount: items.length,
        },
    };
};

// ==================== DSR LEDGER ====================

// Order-based summary item for DSR ledger
export interface DsrOrderSummaryItem {
    orderId: number;
    orderNumber: string;
    orderDate: string;
    routeName: string;
    orderTotal: string;
    totalReturns: string;
    netOrderTotal: string;
    payments: { method: string; amount: string }[];
    expenses: { type: string; amount: string }[];
    customerDues: { customerName: string; amount: string }[];
    totalPayments: string;
    totalExpenses: string;
    totalCustomerDue: string;
    orderDue: string;
}

export interface DsrLedgerResponse {
    dsrId: number;
    dsrName: string;
    orders: DsrOrderSummaryItem[];
}

/**
 * Get DSR Ledger - shows all orders with payments, expenses, and customer dues for a DSR
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

    // Get sales in date range (excluding cancelled/return)
    const sales = await db
        .select({
            orderId: wholesaleOrders.id,
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

    // Get all order IDs for fetching adjustment data
    const orderIds = sales.map(s => s.orderId);

    // Fetch customer dues for these orders
    const customerDuesData = orderIds.length > 0 ? await db.query.orderCustomerDues.findMany({
        where: (d, { inArray }) => inArray(d.orderId, orderIds),
    }) : [];

    // Fetch expenses for these orders
    const expensesData = orderIds.length > 0 ? await db.query.orderExpenses.findMany({
        where: (e, { inArray }) => inArray(e.orderId, orderIds),
    }) : [];

    // Fetch payments for these orders (by orderId)
    const paymentsForOrders = orderIds.length > 0 ? await db.query.orderPayments.findMany({
        where: (p, { inArray }) => inArray(p.orderId, orderIds),
    }) : [];

    // Fetch returns for these orders
    const returnsData = orderIds.length > 0 ? await db.query.orderItemReturns.findMany({
        where: (r, { inArray }) => inArray(r.orderId, orderIds),
    }) : [];

    // Group returns and adjustment discounts by order ID
    const returnsByOrderId = new Map<number, number>();
    const adjDiscountsByOrderId = new Map<number, number>();
    for (const ret of returnsData) {
        returnsByOrderId.set(ret.orderId, (returnsByOrderId.get(ret.orderId) || 0) + parseFloat(ret.returnAmount));
        adjDiscountsByOrderId.set(ret.orderId, (adjDiscountsByOrderId.get(ret.orderId) || 0) + parseFloat(ret.adjustmentDiscount || "0"));
    }

    // Group customer dues by order ID
    const customerDuesByOrderId = new Map<number, { customerName: string; amount: string }[]>();
    for (const due of customerDuesData) {
        const existing = customerDuesByOrderId.get(due.orderId) || [];
        existing.push({ customerName: due.customerName, amount: due.amount });
        customerDuesByOrderId.set(due.orderId, existing);
    }

    // Group expenses by order ID
    const expensesByOrderId = new Map<number, { type: string; amount: string }[]>();
    for (const exp of expensesData) {
        const existing = expensesByOrderId.get(exp.orderId) || [];
        existing.push({ type: exp.expenseType, amount: exp.amount });
        expensesByOrderId.set(exp.orderId, existing);
    }

    // Group payments by order ID
    const paymentsByOrderId = new Map<number, { method: string; amount: string }[]>();
    for (const pay of paymentsForOrders) {
        const existing = paymentsByOrderId.get(pay.orderId) || [];
        existing.push({ method: pay.paymentMethod || "Cash", amount: pay.amount });
        paymentsByOrderId.set(pay.orderId, existing);
    }

    // Build order-based summary
    const orders: DsrOrderSummaryItem[] = sales.map(sale => {
        const orderPaymentsList = paymentsByOrderId.get(sale.orderId) || [];
        const orderExpensesList = expensesByOrderId.get(sale.orderId) || [];
        const orderCustomerDues = customerDuesByOrderId.get(sale.orderId) || [];
        const orderReturns = returnsByOrderId.get(sale.orderId) || 0;
        const orderAdjDiscounts = adjDiscountsByOrderId.get(sale.orderId) || 0;

        const totalPayments = orderPaymentsList.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const totalExpenses = orderExpensesList.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalCustomerDue = orderCustomerDues.reduce((sum, d) => sum + parseFloat(d.amount), 0);
        const orderTotal = parseFloat(sale.total);
        const netOrderTotal = orderTotal - orderReturns - orderAdjDiscounts;

        // Order Due = Customer Dues (what DSR still needs to collect from customers)
        const orderDue = totalCustomerDue;

        return {
            orderId: sale.orderId,
            orderNumber: sale.orderNumber,
            orderDate: sale.date,
            routeName: sale.routeName,
            orderTotal: orderTotal.toFixed(2),
            totalReturns: (orderReturns + orderAdjDiscounts).toFixed(2),
            netOrderTotal: netOrderTotal.toFixed(2),
            payments: orderPaymentsList,
            expenses: orderExpensesList,
            customerDues: orderCustomerDues,
            totalPayments: totalPayments.toFixed(2),
            totalExpenses: totalExpenses.toFixed(2),
            totalCustomerDue: totalCustomerDue.toFixed(2),
            orderDue: orderDue.toFixed(2),
        };
    });

    return {
        dsrId,
        dsrName: dsrInfo.name,
        orders,
    };
};

// ==================== DSR LEDGER OVERVIEW ====================

export interface DsrLedgerOverviewItem {
    dsrId: number;
    dsrName: string;
    orderCount: number;
    totalNetSales: string;
    totalCollected: string;
    totalExpenses: string;
    totalDue: string; // Customer dues
}

export interface DsrLedgerOverviewResponse {
    items: DsrLedgerOverviewItem[];
    totals: {
        totalOrders: number;
        totalNetSales: string;
        totalCollected: string;
        totalExpenses: string;
        totalDue: string;
    };
}

export interface DsrLedgerOverviewQuery {
    startDate: string;
    endDate: string;
}

/**
 * Get DSR Ledger Overview - shows summary for all DSRs using order-based calculations
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
    let grandTotalOrders = 0;
    let grandTotalNetSales = 0;
    let grandTotalCollected = 0;
    let grandTotalExpenses = 0;
    let grandTotalDue = 0;

    for (const dsrInfo of allDsrs) {
        // Get orders in date range for this DSR
        const orders = await db
            .select({ id: wholesaleOrders.id, total: wholesaleOrders.total })
            .from(wholesaleOrders)
            .where(and(
                eq(wholesaleOrders.dsrId, dsrInfo.id),
                gte(wholesaleOrders.orderDate, startDate),
                lte(wholesaleOrders.orderDate, endDate),
                ne(wholesaleOrders.status, "cancelled"),
                ne(wholesaleOrders.status, "return")
            ));

        const orderIds = orders.map(o => o.id);
        const orderCount = orders.length;

        if (orderCount === 0) {
            // Skip DSRs with no orders in the date range
            continue;
        }

        // Fetch returns for these orders
        const returnsData = await db.query.orderItemReturns.findMany({
            where: (r, { inArray }) => inArray(r.orderId, orderIds),
        });

        // Fetch payments for these orders
        const paymentsData = await db.query.orderPayments.findMany({
            where: (p, { inArray }) => inArray(p.orderId, orderIds),
        });

        // Fetch expenses for these orders
        const expensesData = await db.query.orderExpenses.findMany({
            where: (e, { inArray }) => inArray(e.orderId, orderIds),
        });

        // Fetch customer dues for these orders
        const customerDuesData = await db.query.orderCustomerDues.findMany({
            where: (d, { inArray }) => inArray(d.orderId, orderIds),
        });

        // Calculate totals
        const grossSales = orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
        const totalReturns = returnsData.reduce((sum, r) => sum + parseFloat(r.returnAmount) + parseFloat(r.adjustmentDiscount || "0"), 0);
        const totalNetSales = grossSales - totalReturns;
        const totalCollected = paymentsData.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const totalExpenses = expensesData.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalDue = customerDuesData.reduce((sum, d) => sum + parseFloat(d.amount), 0);

        items.push({
            dsrId: dsrInfo.id,
            dsrName: dsrInfo.name,
            orderCount,
            totalNetSales: totalNetSales.toFixed(2),
            totalCollected: totalCollected.toFixed(2),
            totalExpenses: totalExpenses.toFixed(2),
            totalDue: totalDue.toFixed(2),
        });

        grandTotalOrders += orderCount;
        grandTotalNetSales += totalNetSales;
        grandTotalCollected += totalCollected;
        grandTotalExpenses += totalExpenses;
        grandTotalDue += totalDue;
    }

    return {
        items,
        totals: {
            totalOrders: grandTotalOrders,
            totalNetSales: grandTotalNetSales.toFixed(2),
            totalCollected: grandTotalCollected.toFixed(2),
            totalExpenses: grandTotalExpenses.toFixed(2),
            totalDue: grandTotalDue.toFixed(2),
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

// ===================== DAILY SETTLEMENT =====================

export interface NetSalesItem {
    orderDate: string;
    dsrId: number;
    dsrName: string;
    routeId: number;
    routeName: string;
    sale: string;
    returnAmount: string;
    discount: string;
    netSales: string;
    totalReceived: string;
    due: string;
}

export interface ExpenseItem {
    orderDate: string;
    dsrId: number;
    dsrName: string;
    routeId: number;
    routeName: string;
    expenseType: string;
    amount: string;
}

export interface PaymentReceivedItem {
    paymentDate: string;
    dsrId: number;
    dsrName: string;
    routeId: number;
    routeName: string;
    cash: string;
    mobileBank: string;
    bank: string;
    total: string;
}

export interface DailySettlementSummary {
    netTotalSales: string;
    totalExpenses: string;
    totalPaymentReceived: string;
    totalDue: string;
}

export interface DailySettlementResponse {
    netSales: NetSalesItem[];
    expenses: ExpenseItem[];
    paymentsReceived: PaymentReceivedItem[];
    summary: DailySettlementSummary;
}

/**
 * Get daily settlement report
 * Shows net sales, expenses, and payments received for a date
 */
export const getDailySettlement = async (
    query: DailySettlementQuery
): Promise<DailySettlementResponse> => {
    // Default to today if no date provided
    const today = new Date().toISOString().split("T")[0];
    const startDate = query.startDate || query.date || today;
    const endDate = query.endDate || query.date || today;

    // Build order conditions
    const orderConditions = [
        gte(wholesaleOrders.orderDate, startDate!),
        lte(wholesaleOrders.orderDate, endDate!),
        ne(wholesaleOrders.status, "cancelled"),
    ];

    if (query.dsrId) {
        orderConditions.push(eq(wholesaleOrders.dsrId, query.dsrId));
    }

    if (query.routeId) {
        orderConditions.push(eq(wholesaleOrders.routeId, query.routeId));
    }

    // 1. Get Net Sales data (orders with returns and payments)
    const orders = await db
        .select({
            orderId: wholesaleOrders.id,
            orderDate: wholesaleOrders.orderDate,
            dsrId: wholesaleOrders.dsrId,
            dsrName: dsr.name,
            routeId: wholesaleOrders.routeId,
            routeName: route.name,
            total: wholesaleOrders.total,
            discount: wholesaleOrders.discount,
        })
        .from(wholesaleOrders)
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        .innerJoin(route, eq(wholesaleOrders.routeId, route.id))
        .where(and(...orderConditions))
        .orderBy(wholesaleOrders.orderDate, dsr.name);

    const orderIds = orders.map(o => o.orderId);

    // Fetch related data
    const allPayments = orderIds.length > 0 ? await db.query.orderPayments.findMany({
        where: (p, { inArray }) => inArray(p.orderId, orderIds),
    }) : [];

    const allExpenses = orderIds.length > 0 ? await db.query.orderExpenses.findMany({
        where: (e, { inArray }) => inArray(e.orderId, orderIds),
    }) : [];

    const allReturns = orderIds.length > 0 ? await db.query.orderItemReturns.findMany({
        where: (r, { inArray }) => inArray(r.orderId, orderIds),
    }) : [];

    // Group payments/returns by order
    const paymentsByOrder = new Map<number, { cash: number; mobileBank: number; bank: number; total: number }>();
    for (const p of allPayments) {
        const existing = paymentsByOrder.get(p.orderId) || { cash: 0, mobileBank: 0, bank: 0, total: 0 };
        const amount = parseFloat(p.amount);
        existing.total += amount;
        if (p.paymentMethod === "cash") existing.cash += amount;
        else if (p.paymentMethod === "mobileBank") existing.mobileBank += amount;
        else if (p.paymentMethod === "bank") existing.bank += amount;
        else existing.cash += amount; // Default to cash
        paymentsByOrder.set(p.orderId, existing);
    }

    const returnsByOrder = new Map<number, number>();
    for (const r of allReturns) {
        returnsByOrder.set(r.orderId, (returnsByOrder.get(r.orderId) || 0) + parseFloat(r.returnAmount));
    }

    // Build Net Sales items
    let totalNetSales = 0;
    let totalReceived = 0;
    let totalDue = 0;

    const netSales: NetSalesItem[] = orders.map((order) => {
        const sale = parseFloat(order.total);
        const discount = parseFloat(order.discount);
        const returnAmount = returnsByOrder.get(order.orderId) || 0;
        const payments = paymentsByOrder.get(order.orderId) || { cash: 0, mobileBank: 0, bank: 0, total: 0 };

        const netSalesAmount = sale - returnAmount - discount;
        const due = Math.max(0, netSalesAmount - payments.total);

        totalNetSales += netSalesAmount;
        totalReceived += payments.total;
        totalDue += due;

        return {
            orderDate: order.orderDate,
            dsrId: order.dsrId,
            dsrName: order.dsrName,
            routeId: order.routeId,
            routeName: order.routeName,
            sale: sale.toFixed(2),
            returnAmount: returnAmount.toFixed(2),
            discount: discount.toFixed(2),
            netSales: netSalesAmount.toFixed(2),
            totalReceived: payments.total.toFixed(2),
            due: due.toFixed(2),
        };
    });

    // 2. Build Expenses list
    let totalExpenses = 0;
    const orderMap = new Map(orders.map(o => [o.orderId, o]));

    const expenses: ExpenseItem[] = allExpenses.map((expense) => {
        const order = orderMap.get(expense.orderId);
        totalExpenses += parseFloat(expense.amount);

        return {
            orderDate: order?.orderDate || "",
            dsrId: order?.dsrId || 0,
            dsrName: order?.dsrName || "",
            routeId: order?.routeId || 0,
            routeName: order?.routeName || "",
            expenseType: expense.expenseType,
            amount: expense.amount,
        };
    });

    // 3. Build Payments Received grouped by DSR/Route
    const paymentGroups = new Map<string, PaymentReceivedItem>();

    for (const payment of allPayments) {
        const order = orderMap.get(payment.orderId);
        if (!order) continue;

        const key = `${payment.paymentDate}-${order.dsrId}-${order.routeId}`;
        const existing = paymentGroups.get(key) || {
            paymentDate: payment.paymentDate,
            dsrId: order.dsrId,
            dsrName: order.dsrName,
            routeId: order.routeId,
            routeName: order.routeName,
            cash: "0.00",
            mobileBank: "0.00",
            bank: "0.00",
            total: "0.00",
        };

        const amount = parseFloat(payment.amount);
        const currentCash = parseFloat(existing.cash);
        const currentMobile = parseFloat(existing.mobileBank);
        const currentBank = parseFloat(existing.bank);
        const currentTotal = parseFloat(existing.total);

        if (payment.paymentMethod === "cash") {
            existing.cash = (currentCash + amount).toFixed(2);
        } else if (payment.paymentMethod === "mobileBank") {
            existing.mobileBank = (currentMobile + amount).toFixed(2);
        } else if (payment.paymentMethod === "bank") {
            existing.bank = (currentBank + amount).toFixed(2);
        } else {
            existing.cash = (currentCash + amount).toFixed(2);
        }
        existing.total = (currentTotal + amount).toFixed(2);

        paymentGroups.set(key, existing);
    }

    const paymentsReceived = Array.from(paymentGroups.values());

    return {
        netSales,
        expenses,
        paymentsReceived,
        summary: {
            netTotalSales: totalNetSales.toFixed(2),
            totalExpenses: totalExpenses.toFixed(2),
            totalPaymentReceived: totalReceived.toFixed(2),
            totalDue: totalDue.toFixed(2),
        },
    };
};
