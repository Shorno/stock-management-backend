import { db } from "../../db/config";
import { wholesaleOrders, wholesaleOrderItems, dsr, route, stockBatch, orderExpenses, orderItemReturns, orderPayments, orderCustomerDues, damageReturns, damageReturnItems } from "../../db/schema";
import { product } from "../../db/schema";
import { eq, and, gte, lte, desc, sum, count, ne, sql } from "drizzle-orm";

export interface DateRange {
    startDate?: string;
    endDate?: string;
}

export interface SalesOverview {
    totalSales: number;
    totalOrders: number;
    totalReturns: number;
    totalProfit: number;
    previousPeriod?: {
        totalSales: number;
        totalOrders: number;
        totalReturns: number;
        totalProfit: number;
    };
}

export interface SalesByPeriodItem {
    date: string;
    sales: number;
    orders: number;
    profit: number;
}

export interface SalesByDSRItem {
    dsrId: number;
    dsrName: string;
    totalSales: number;
    orderCount: number;
}

export interface SalesByRouteItem {
    routeId: number;
    routeName: string;
    totalSales: number;
    orderCount: number;
}

export interface TopProductItem {
    productId: number;
    productName: string;
    quantitySold: number;
    revenue: number;
}

export interface OrderStatusItem {
    status: string;
    count: number;
    percentage: number;
}

function getDateFilter(startDate?: string, endDate?: string) {
    const filters = [];
    if (startDate) {
        filters.push(gte(wholesaleOrders.orderDate, startDate));
    }
    if (endDate) {
        filters.push(lte(wholesaleOrders.orderDate, endDate));
    }
    return filters;
}

function getPreviousPeriodDates(startDate?: string, endDate?: string): { prevStart: string; prevEnd: string } | null {
    if (!startDate || !endDate) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end.getTime() - start.getTime();

    const prevEnd = new Date(start.getTime() - 1); // day before start
    const prevStart = new Date(prevEnd.getTime() - duration);

    return {
        prevStart: prevStart.toISOString().split('T')[0] as string,
        prevEnd: prevEnd.toISOString().split('T')[0] as string
    };
}

async function calculateSalesMetrics(dateFilters: ReturnType<typeof getDateFilter>) {
    // Get all non-cancelled orders sales (adjustment-based pattern)
    const validOrderFilter = ne(wholesaleOrders.status, 'cancelled');
    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    const salesResult = await db
        .select({
            totalSales: sum(wholesaleOrders.total),
        })
        .from(wholesaleOrders)
        .where(allFilters);

    // Get total orders count (excluding cancelled)
    const ordersResult = await db
        .select({
            totalOrders: count(),
        })
        .from(wholesaleOrders)
        .where(allFilters);

    // Get order IDs for fetching returns from adjustments
    const orderIdsResult = await db
        .select({ id: wholesaleOrders.id })
        .from(wholesaleOrders)
        .where(allFilters);
    const orderIds = orderIdsResult.map(o => o.id);

    // Get returns from order_item_returns (adjustment data)
    let totalReturns = 0;
    if (orderIds.length > 0) {
        const returnsResult = await db
            .select({
                totalReturns: sum(orderItemReturns.returnAmount),
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);
        totalReturns = Number(returnsResult[0]?.totalReturns || 0);
    }

    // Calculate profit from order items
    const profitResult = await db
        .select({
            totalProfit: sum(wholesaleOrderItems.net),
        })
        .from(wholesaleOrderItems)
        .innerJoin(wholesaleOrders, eq(wholesaleOrderItems.orderId, wholesaleOrders.id))
        .where(allFilters);

    const grossSales = Number(salesResult[0]?.totalSales || 0);

    return {
        totalSales: grossSales - totalReturns, // Net sales after returns
        totalOrders: Number(ordersResult[0]?.totalOrders || 0),
        totalReturns: totalReturns, // Return amounts from adjustments
        totalProfit: Number(profitResult[0]?.totalProfit || 0) - totalReturns,
    };
}

export async function getSalesOverview(dateRange?: DateRange): Promise<SalesOverview> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);

    const result = await calculateSalesMetrics(dateFilters);

    const overview: SalesOverview = { ...result };

    // Get previous period data if date range is provided
    const prevDates = getPreviousPeriodDates(dateRange?.startDate, dateRange?.endDate);
    if (prevDates) {
        const prevFilters = getDateFilter(prevDates.prevStart, prevDates.prevEnd);
        overview.previousPeriod = await calculateSalesMetrics(prevFilters);
    }

    return overview;
}

export async function getSalesByPeriod(
    period: 'daily' | 'weekly' | 'monthly',
    dateRange?: DateRange
): Promise<SalesByPeriodItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const validOrderFilter = ne(wholesaleOrders.status, 'cancelled');
    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    // Get all orders within the date range
    const orders = await db
        .select({
            orderDate: wholesaleOrders.orderDate,
            total: wholesaleOrders.total,
        })
        .from(wholesaleOrders)
        .where(allFilters)
        .orderBy(wholesaleOrders.orderDate);

    // Group by period in JavaScript
    const groupedData = new Map<string, { sales: number; orders: number }>();

    for (const order of orders) {
        const date = new Date(order.orderDate);
        let key: string;

        switch (period) {
            case 'daily':
                key = date.toISOString().split('T')[0]!;
                break;
            case 'weekly':
                // Get ISO week number
                const startOfYear = new Date(date.getFullYear(), 0, 1);
                const weekNumber = Math.ceil(
                    ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
                );
                key = `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
                break;
            case 'monthly':
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                break;
        }

        const existing = groupedData.get(key) || { sales: 0, orders: 0 };
        groupedData.set(key, {
            sales: existing.sales + Number(order.total || 0),
            orders: existing.orders + 1,
        });
    }

    // Convert to array and sort
    const sortedData = Array.from(groupedData.entries())
        .map(([date, data]) => ({
            date,
            sales: data.sales,
            orders: data.orders,
            profit: data.sales * 0.15, // Simplified profit estimate
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // Fill in missing dates for continuous chart line
    if (sortedData.length > 0 && dateRange?.startDate && dateRange?.endDate) {
        return fillMissingDates(sortedData, period, dateRange.startDate, dateRange.endDate);
    }

    return sortedData;
}

function fillMissingDates(
    data: SalesByPeriodItem[],
    period: 'daily' | 'weekly' | 'monthly',
    startDate: string,
    endDate: string
): SalesByPeriodItem[] {
    const result: SalesByPeriodItem[] = [];
    const dataMap = new Map(data.map(d => [d.date, d]));

    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);

    while (current <= end) {
        let key: string;

        switch (period) {
            case 'daily':
                key = current.toISOString().split('T')[0]!;
                break;
            case 'weekly':
                const startOfYear = new Date(current.getFullYear(), 0, 1);
                const weekNumber = Math.ceil(
                    ((current.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
                );
                key = `${current.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
                break;
            case 'monthly':
                key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
                break;
        }

        const existing = dataMap.get(key);
        if (existing) {
            result.push(existing);
        } else {
            result.push({ date: key, sales: 0, orders: 0, profit: 0 });
        }

        // Advance to next period
        switch (period) {
            case 'daily':
                current.setDate(current.getDate() + 1);
                break;
            case 'weekly':
                current.setDate(current.getDate() + 7);
                break;
            case 'monthly':
                current.setMonth(current.getMonth() + 1);
                break;
        }
    }

    // Remove duplicate keys (can happen with weekly/monthly)
    const seen = new Set<string>();
    return result.filter(item => {
        if (seen.has(item.date)) return false;
        seen.add(item.date);
        return true;
    });
}

export async function getSalesByDSR(dateRange?: DateRange): Promise<SalesByDSRItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const validOrderFilter = ne(wholesaleOrders.status, 'cancelled');

    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    // Get gross sales by DSR
    const result = await db
        .select({
            dsrId: dsr.id,
            dsrName: dsr.name,
            totalSales: sum(wholesaleOrders.total),
            orderCount: count(wholesaleOrders.id),
        })
        .from(wholesaleOrders)
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        .where(allFilters)
        .groupBy(dsr.id, dsr.name)
        .orderBy(desc(sum(wholesaleOrders.total)));

    // Get order IDs grouped by DSR to calculate returns
    const ordersWithDsr = await db
        .select({
            orderId: wholesaleOrders.id,
            dsrId: wholesaleOrders.dsrId,
        })
        .from(wholesaleOrders)
        .where(allFilters);

    const orderIds = ordersWithDsr.map(o => o.orderId);

    // Fetch returns for these orders
    let returnsByDsr = new Map<number, number>();
    if (orderIds.length > 0) {
        const returnsData = await db
            .select({
                orderId: orderItemReturns.orderId,
                totalReturns: sum(orderItemReturns.returnAmount),
                totalAdjDiscount: sum(orderItemReturns.adjustmentDiscount),
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`)
            .groupBy(orderItemReturns.orderId);

        // Map order to DSR
        const orderToDsr = new Map<number, number>();
        for (const o of ordersWithDsr) {
            orderToDsr.set(o.orderId, o.dsrId);
        }

        // Aggregate returns by DSR
        for (const ret of returnsData) {
            const dsrId = orderToDsr.get(ret.orderId);
            if (dsrId) {
                const currentReturns = returnsByDsr.get(dsrId) || 0;
                returnsByDsr.set(dsrId, currentReturns + Number(ret.totalReturns || 0) + Number(ret.totalAdjDiscount || 0));
            }
        }
    }

    // Calculate net sales (gross - returns)
    return result.map(r => ({
        dsrId: r.dsrId,
        dsrName: r.dsrName,
        totalSales: Number(r.totalSales || 0) - (returnsByDsr.get(r.dsrId) || 0),
        orderCount: Number(r.orderCount || 0),
    }));
}

export async function getSalesByRoute(dateRange?: DateRange): Promise<SalesByRouteItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const validOrderFilter = ne(wholesaleOrders.status, 'cancelled');

    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    // Get gross sales by route
    const result = await db
        .select({
            routeId: route.id,
            routeName: route.name,
            totalSales: sum(wholesaleOrders.total),
            orderCount: count(wholesaleOrders.id),
        })
        .from(wholesaleOrders)
        .innerJoin(route, eq(wholesaleOrders.routeId, route.id))
        .where(allFilters)
        .groupBy(route.id, route.name)
        .orderBy(desc(sum(wholesaleOrders.total)));

    // Get order IDs grouped by route to calculate returns
    const ordersWithRoute = await db
        .select({
            orderId: wholesaleOrders.id,
            routeId: wholesaleOrders.routeId,
        })
        .from(wholesaleOrders)
        .where(allFilters);

    const orderIds = ordersWithRoute.map(o => o.orderId);

    // Fetch returns for these orders
    let returnsByRoute = new Map<number, number>();
    if (orderIds.length > 0) {
        const returnsData = await db
            .select({
                orderId: orderItemReturns.orderId,
                totalReturns: sum(orderItemReturns.returnAmount),
                totalAdjDiscount: sum(orderItemReturns.adjustmentDiscount),
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`)
            .groupBy(orderItemReturns.orderId);

        // Map order to route
        const orderToRoute = new Map<number, number>();
        for (const o of ordersWithRoute) {
            orderToRoute.set(o.orderId, o.routeId);
        }

        // Aggregate returns by route
        for (const ret of returnsData) {
            const routeId = orderToRoute.get(ret.orderId);
            if (routeId) {
                const currentReturns = returnsByRoute.get(routeId) || 0;
                returnsByRoute.set(routeId, currentReturns + Number(ret.totalReturns || 0) + Number(ret.totalAdjDiscount || 0));
            }
        }
    }

    // Calculate net sales (gross - returns)
    return result.map(r => ({
        routeId: r.routeId,
        routeName: r.routeName,
        totalSales: Number(r.totalSales || 0) - (returnsByRoute.get(r.routeId) || 0),
        orderCount: Number(r.orderCount || 0),
    }));
}

export async function getTopProducts(limit: number = 10, dateRange?: DateRange): Promise<TopProductItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const validOrderFilter = ne(wholesaleOrders.status, 'cancelled');

    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    const result = await db
        .select({
            productId: product.id,
            productName: product.name,
            quantitySold: sum(wholesaleOrderItems.totalQuantity),
            revenue: sum(wholesaleOrderItems.net),
        })
        .from(wholesaleOrderItems)
        .innerJoin(wholesaleOrders, eq(wholesaleOrderItems.orderId, wholesaleOrders.id))
        .innerJoin(product, eq(wholesaleOrderItems.productId, product.id))
        .where(allFilters)
        .groupBy(product.id, product.name)
        .orderBy(desc(sum(wholesaleOrderItems.net)))
        .limit(limit);

    return result.map(r => ({
        productId: r.productId,
        productName: r.productName,
        quantitySold: Number(r.quantitySold || 0),
        revenue: Number(r.revenue || 0),
    }));
}

export async function getOrderStatusBreakdown(dateRange?: DateRange): Promise<OrderStatusItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);

    const result = await db
        .select({
            status: wholesaleOrders.status,
            count: count(),
        })
        .from(wholesaleOrders)
        .where(dateFilters.length > 0 ? and(...dateFilters) : undefined)
        .groupBy(wholesaleOrders.status);

    const total = result.reduce((acc, r) => acc + Number(r.count), 0);

    return result.map(r => ({
        status: r.status,
        count: Number(r.count),
        percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
    }));
}

// ==================== DASHBOARD STATS ====================

export interface DashboardStats {
    netSales: number;
    netPurchase: number;
    currentStock: number;
    profitLoss: number;
    dsrSalesDue: number;
    cashBalance: number;
    supplierDue: number;
}

/**
 * Get dashboard statistics summary
 * Optionally filtered by date range
 */
export async function getDashboardStats(dateRange?: DateRange): Promise<DashboardStats> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);

    // ----- NET SALES -----
    // Total sales from all orders (excluding cancelled) minus returns from adjustments
    // Following the same pattern as getDailySalesCollection in reports service
    const validOrderFilter = ne(wholesaleOrders.status, 'cancelled');
    const salesFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    // Get total sales
    const salesResult = await db
        .select({
            totalSales: sum(wholesaleOrders.total),
        })
        .from(wholesaleOrders)
        .where(salesFilters);

    const totalSales = Number(salesResult[0]?.totalSales || 0);

    // Get total returns (for orders in date range)
    const orderIdsResult = await db
        .select({ id: wholesaleOrders.id })
        .from(wholesaleOrders)
        .where(salesFilters);

    const orderIds = orderIdsResult.map(o => o.id);

    let totalReturns = 0;
    let totalAdjustmentDiscounts = 0;
    if (orderIds.length > 0) {
        const returnsResult = await db
            .select({
                totalReturns: sum(orderItemReturns.returnAmount),
                totalAdjustmentDiscounts: sum(orderItemReturns.adjustmentDiscount),
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);
        totalReturns = Number(returnsResult[0]?.totalReturns || 0);
        totalAdjustmentDiscounts = Number(returnsResult[0]?.totalAdjustmentDiscounts || 0);
    }

    // Get damage returns (approved only)
    const damageReturnsFilters = [eq(damageReturns.status, 'approved')];
    if (dateRange?.startDate) {
        damageReturnsFilters.push(gte(damageReturns.returnDate, dateRange.startDate));
    }
    if (dateRange?.endDate) {
        damageReturnsFilters.push(lte(damageReturns.returnDate, dateRange.endDate));
    }

    const damageReturnsResult = await db
        .select({
            totalProfit: sql<number>`sum((COALESCE(${stockBatch.sellPrice}, 0) - ${damageReturnItems.unitPrice}) * ${damageReturnItems.quantity})`,
        })
        .from(damageReturns)
        .innerJoin(damageReturnItems, eq(damageReturns.id, damageReturnItems.returnId))
        .leftJoin(stockBatch, eq(damageReturnItems.batchId, stockBatch.id))
        .where(and(...damageReturnsFilters));

    const totalDamageProfit = Number(damageReturnsResult[0]?.totalProfit || 0);

    // Subtract Order Returns (Adjustments) and Damage Returns Profit from Net Sales
    // User logic: effectively only removing the profit margin of the damaged item from the total sales
    const netSales = totalSales - totalReturns - totalAdjustmentDiscounts - totalDamageProfit;

    // ----- NET PURCHASE -----
    // Sum of supplier price × initial quantity for all batches (optionally filtered by date)
    let purchaseFilters = undefined;
    if (dateRange?.startDate) {
        purchaseFilters = and(
            gte(stockBatch.createdAt, new Date(dateRange.startDate)),
            dateRange.endDate ? lte(stockBatch.createdAt, new Date(dateRange.endDate + 'T23:59:59')) : undefined
        );
    }

    const purchaseResult = await db
        .select({
            batch: stockBatch,
        })
        .from(stockBatch)
        .where(purchaseFilters);

    const netPurchase = purchaseResult.reduce((sum, row) => {
        const supplierPrice = Number(row.batch.supplierPrice || 0);
        const quantity = row.batch.initialQuantity || 0;
        return sum + (supplierPrice * quantity);
    }, 0);

    // ----- CURRENT STOCK -----
    // Sum of remaining quantity × sell price for all batches (not date filtered - current snapshot)
    const stockResult = await db
        .select({
            batch: stockBatch,
        })
        .from(stockBatch);

    const currentStock = stockResult.reduce((sum, row) => {
        const sellPrice = Number(row.batch.sellPrice || 0);
        const remainingQty = row.batch.remainingQuantity || 0;
        return sum + (sellPrice * remainingQty);
    }, 0);

    // ----- PROFIT & LOSS -----
    // Net Sales - Cost of Goods Sold
    // For sold items, we need to calculate the cost based on supplier prices
    // IMPORTANT: Use net quantity (totalQuantity - returnQuantity) to account for returns
    let costOfGoodsSold = 0;
    if (orderIds.length > 0) {
        // Get order items for completed orders
        const orderItemsResult = await db
            .select({
                item: wholesaleOrderItems,
                batch: stockBatch,
            })
            .from(wholesaleOrderItems)
            .innerJoin(stockBatch, eq(wholesaleOrderItems.batchId, stockBatch.id))
            .where(sql`${wholesaleOrderItems.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

        // Get return quantities for each order item
        const returnsResult = await db
            .select({
                orderItemId: orderItemReturns.orderItemId,
                returnQuantity: orderItemReturns.returnQuantity,
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

        // Create a map of order item ID to return quantity
        const returnQuantityMap = new Map<number, number>();
        for (const ret of returnsResult) {
            returnQuantityMap.set(ret.orderItemId, ret.returnQuantity || 0);
        }

        costOfGoodsSold = orderItemsResult.reduce((sum, row) => {
            const supplierPrice = Number(row.batch.supplierPrice || 0);
            const totalQuantity = row.item.totalQuantity || 0;
            const returnQuantity = returnQuantityMap.get(row.item.id) || 0;
            // Net quantity = total quantity - returned quantity
            const netQuantity = totalQuantity - returnQuantity;
            return sum + (supplierPrice * netQuantity);
        }, 0);
    }

    const profitLoss = netSales - costOfGoodsSold;

    // ----- DSR SALES DUE -----
    // Total outstanding customer dues from all orders (what DSRs need to collect)
    const customerDuesResult = await db
        .select({
            totalDue: sum(orderCustomerDues.amount),
        })
        .from(orderCustomerDues);

    const dsrSalesDue = Number(customerDuesResult[0]?.totalDue || 0);

    // ----- CASH BALANCE -----
    // Total payments received - total expenses
    let paymentFilters = undefined;
    let expenseFilters = undefined;

    if (dateRange?.startDate) {
        paymentFilters = and(
            gte(orderPayments.paymentDate, dateRange.startDate),
            dateRange.endDate ? lte(orderPayments.paymentDate, dateRange.endDate) : undefined
        );
    }

    const paymentsReceivedResult = await db
        .select({
            total: sum(orderPayments.amount),
        })
        .from(orderPayments)
        .where(paymentFilters);

    const expensesResult = await db
        .select({
            total: sum(orderExpenses.amount),
        })
        .from(orderExpenses)
        .where(expenseFilters);

    const paymentsReceived = Number(paymentsReceivedResult[0]?.total || 0);
    const totalExpenses = Number(expensesResult[0]?.total || 0);
    const cashBalance = paymentsReceived - totalExpenses;

    // ----- SUPPLIER DUE -----
    // Total purchases from suppliers - total payments to suppliers
    const { supplierPurchases, supplierPayments } = await import("../../db/schema/supplier-schema");

    const supplierPurchasesResult = await db
        .select({ total: sum(supplierPurchases.amount) })
        .from(supplierPurchases);

    const supplierPaymentsResult = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments);

    const totalSupplierPurchases = Number(supplierPurchasesResult[0]?.total || 0);
    const totalSupplierPayments = Number(supplierPaymentsResult[0]?.total || 0);
    const supplierDue = totalSupplierPurchases - totalSupplierPayments;

    return {
        netSales: Math.round(netSales * 100) / 100,
        netPurchase: Math.round(netPurchase * 100) / 100,
        currentStock: Math.round(currentStock * 100) / 100,
        profitLoss: Math.round(profitLoss * 100) / 100,
        dsrSalesDue: Math.round(dsrSalesDue * 100) / 100,
        cashBalance: Math.round(cashBalance * 100) / 100,
        supplierDue: Math.round(supplierDue * 100) / 100,
    };
}


