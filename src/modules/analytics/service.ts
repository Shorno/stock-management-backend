import { db } from "../../db/config";
import { wholesaleOrders, wholesaleOrderItems, dsr, route, stockBatch, orderExpenses, orderItemReturns, orderPayments, orderCustomerDues, orderDsrDues, orderSrDues, damageReturns, damageReturnItems, bills, orderDamageItems, dueCollections, dsrDueCollections, srDueCollections, plAdjustments } from "../../db/schema";
import { product, productVariant, stockAdjustments, cashWithdrawals } from "../../db/schema";
import { eq, and, gte, lte, desc, sum, count, ne, sql } from "drizzle-orm";
import { getUnitMultiplier } from "../unit/service";

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
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));
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
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));
    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    // Get all orders within the date range
    const orders = await db
        .select({
            orderId: wholesaleOrders.id,
            orderDate: wholesaleOrders.orderDate,
            total: wholesaleOrders.total,
        })
        .from(wholesaleOrders)
        .where(allFilters)
        .orderBy(wholesaleOrders.orderDate);

    // Fetch returns for these orders to calculate net sales
    const orderIds = orders.map(o => o.orderId);
    const returnsByOrder = new Map<number, number>();
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

        for (const ret of returnsData) {
            returnsByOrder.set(ret.orderId, Number(ret.totalReturns || 0) + Number(ret.totalAdjDiscount || 0));
        }
    }

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
        const orderTotal = Number(order.total || 0);
        const orderReturns = returnsByOrder.get(order.orderId) || 0;
        groupedData.set(key, {
            sales: existing.sales + (orderTotal - orderReturns),
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
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));

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
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));

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

export interface SalesBySRItem {
    srId: number;
    srName: string;
    totalSales: number;
    orderCount: number;
}

export async function getSalesBySR(dateRange?: DateRange): Promise<SalesBySRItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));

    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    // Get order items grouped by SR (only items with SR assigned)
    const { sr } = await import("../../db/schema");

    const result = await db
        .select({
            srId: sr.id,
            srName: sr.name,
            totalSales: sql<string>`SUM(
                CAST(${wholesaleOrderItems.net} AS DECIMAL)
                - CAST(COALESCE(${orderItemReturns.returnAmount}, '0') AS DECIMAL)
                - CAST(COALESCE(${orderItemReturns.adjustmentDiscount}, '0') AS DECIMAL)
            )`,
            orderCount: sql<number>`COUNT(DISTINCT ${wholesaleOrderItems.orderId})`,
        })
        .from(wholesaleOrderItems)
        .innerJoin(wholesaleOrders, eq(wholesaleOrderItems.orderId, wholesaleOrders.id))
        .innerJoin(sr, eq(wholesaleOrderItems.srId, sr.id))
        .leftJoin(orderItemReturns, eq(wholesaleOrderItems.id, orderItemReturns.orderItemId))
        .where(and(...(allFilters ? [allFilters] : []), sql`${wholesaleOrderItems.srId} IS NOT NULL`))
        .groupBy(sr.id, sr.name)
        .orderBy(desc(sql`SUM(CAST(${wholesaleOrderItems.net} AS DECIMAL))`));

    return result.map(r => ({
        srId: r.srId,
        srName: r.srName,
        totalSales: Number(r.totalSales || 0),
        orderCount: Number(r.orderCount || 0),
    }));
}

export async function getTopProducts(limit: number = 10, dateRange?: DateRange): Promise<TopProductItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));

    const allFilters = dateFilters.length > 0
        ? and(validOrderFilter, ...dateFilters)
        : validOrderFilter;

    const result = await db
        .select({
            productId: product.id,
            productName: product.name,
            quantitySold: sum(wholesaleOrderItems.totalQuantity),
            revenue: sql<string>`SUM(
                CAST(${wholesaleOrderItems.net} AS DECIMAL)
                - CAST(COALESCE(${orderItemReturns.returnAmount}, '0') AS DECIMAL)
                - CAST(COALESCE(${orderItemReturns.adjustmentDiscount}, '0') AS DECIMAL)
            )`,
        })
        .from(wholesaleOrderItems)
        .innerJoin(wholesaleOrders, eq(wholesaleOrderItems.orderId, wholesaleOrders.id))
        .innerJoin(product, eq(wholesaleOrderItems.productId, product.id))
        .leftJoin(orderItemReturns, eq(wholesaleOrderItems.id, orderItemReturns.orderItemId))
        .where(allFilters)
        .groupBy(product.id, product.name)
        .orderBy(desc(sql`SUM(
                CAST(${wholesaleOrderItems.net} AS DECIMAL)
                - CAST(COALESCE(${orderItemReturns.returnAmount}, '0') AS DECIMAL)
                - CAST(COALESCE(${orderItemReturns.adjustmentDiscount}, '0') AS DECIMAL)
            )`))
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
    dsrOwnDue: number;
    srOwnDue: number;
    cashBalance: number;
    supplierDue: number;
    damageReturnsValue: number;
    pendingOrdersValue: number;
    pendingSalesTotal: number;
    netAssets: number;
}

/**
 * Get dashboard statistics summary
 * Optionally filtered by date range
 */
export async function getDashboardStats(dateRange?: DateRange): Promise<DashboardStats> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);

    // ----- NET SALES -----
    // Total sales from adjusted/settled orders only (excluding cancelled and pending)
    // Pending orders have stock deducted but no settlement — their value is tracked via pendingOrdersValue in net assets
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));
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

    // Get order damage items — both margin (for P&L) and buying price (for Net Sales display)
    let totalOrderDamageMargin = 0;
    let totalOrderDamageCost = 0;
    if (orderIds.length > 0) {
        const orderDamageResult = await db
            .select({
                lostMargin: sql<number>`sum((${orderDamageItems.sellingPrice} - ${orderDamageItems.unitPrice}) * ${orderDamageItems.quantity})`,
                totalCost: sql<number>`sum(CAST(${orderDamageItems.unitPrice} AS DECIMAL) * ${orderDamageItems.quantity})`,
            })
            .from(orderDamageItems)
            .where(sql`${orderDamageItems.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

        totalOrderDamageMargin = Number(orderDamageResult[0]?.lostMargin || 0);
        totalOrderDamageCost = Number(orderDamageResult[0]?.totalCost || 0);
    }

    // ----- DSR EXPENSES -----
    // Fetch DSR expenses from order adjustments for the date range (needed for Net Sales)
    let expenseFilters = undefined;
    if (dateRange?.startDate) {
        expenseFilters = and(
            gte(orderExpenses.createdAt, new Date(dateRange.startDate)),
            dateRange.endDate ? lte(orderExpenses.createdAt, new Date(dateRange.endDate + 'T23:59:59')) : undefined
        );
    }

    const expensesResult = await db
        .select({
            total: sum(orderExpenses.amount),
        })
        .from(orderExpenses)
        .where(expenseFilters);

    const totalExpenses = Number(expensesResult[0]?.total || 0);

    // Net Sales (display): deducts damage at buying price and expenses — reflects actual revenue collected
    const netSales = totalSales - totalReturns - totalAdjustmentDiscounts - totalDamageProfit - totalOrderDamageCost - totalExpenses;

    // Net Sales for P&L: deducts only the lost margin and expenses — keeps profit calculation accurate
    const netSalesForPL = totalSales - totalReturns - totalAdjustmentDiscounts - totalDamageProfit - totalOrderDamageMargin - totalExpenses;

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
    // Sum of remaining quantity × supplier price (buying price) for all batches (not date filtered - current snapshot)
    const stockResult = await db
        .select({
            batch: stockBatch,
        })
        .from(stockBatch);

    const currentStock = stockResult.reduce((sum, row) => {
        const supplierPrice = Number(row.batch.supplierPrice || 0);
        const remainingQty = row.batch.remainingQuantity || 0;
        return sum + (supplierPrice * remainingQty);
    }, 0);

    // ----- PROFIT & LOSS -----
    // Net Sales - Cost of Goods Sold
    // For sold items, we need to calculate the cost based on supplier prices
    // IMPORTANT: Use net quantity (totalQuantity - returnQuantity in base pieces) to account for returns
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

        // Get return data for each order item (need full return data for unit conversion)
        const returnsResult = await db
            .select({
                orderItemId: orderItemReturns.orderItemId,
                returnQuantity: orderItemReturns.returnQuantity,
                returnUnit: orderItemReturns.returnUnit,
                returnExtraPieces: orderItemReturns.returnExtraPieces,
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

        // Create a map of order item ID to return quantity in base pieces
        const returnQuantityMap = new Map<number, number>();
        for (const ret of returnsResult) {
            // Get unit multiplier from database lookup
            const unitMultiplier = await getUnitMultiplier(ret.returnUnit || 'PCS');
            // Calculate total return in base pieces: (returnQuantity × multiplier) + extraPieces
            const returnInBasePieces = (ret.returnQuantity * unitMultiplier) + (ret.returnExtraPieces || 0);
            returnQuantityMap.set(ret.orderItemId, returnInBasePieces);
        }

        costOfGoodsSold = orderItemsResult.reduce((sum, row) => {
            const supplierPrice = Number(row.batch.supplierPrice || 0);
            const totalQuantity = row.item.totalQuantity || 0;
            const returnQuantityInPieces = returnQuantityMap.get(row.item.id) || 0;
            // Net quantity = total quantity - returned quantity (in base pieces)
            const netQuantity = totalQuantity - returnQuantityInPieces;
            return sum + (supplierPrice * netQuantity);
        }, 0);
    }

    // ----- BILLS -----
    // Fetch bills for the date range and deduct from profit
    let billsFilters = undefined;
    if (dateRange?.startDate) {
        billsFilters = and(
            gte(bills.billDate, dateRange.startDate),
            dateRange.endDate ? lte(bills.billDate, dateRange.endDate) : undefined
        );
    }

    const billsResult = await db
        .select({
            totalBills: sum(bills.amount),
        })
        .from(bills)
        .where(billsFilters);

    const totalBills = Number(billsResult[0]?.totalBills || 0);


    // ----- P&L ADJUSTMENTS -----
    // Manual adjustments to profit & loss (income adds, expense subtracts)
    let plAdjustmentFilters = undefined;
    if (dateRange?.startDate) {
        plAdjustmentFilters = and(
            gte(plAdjustments.adjustmentDate, dateRange.startDate),
            dateRange.endDate ? lte(plAdjustments.adjustmentDate, dateRange.endDate) : undefined
        );
    }

    const plAdjustmentResult = await db
        .select({
            totalIncome: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.type} = 'income' THEN CAST(${plAdjustments.amount} AS DECIMAL) ELSE 0 END), 0)`,
            totalExpenseAdj: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.type} = 'expense' THEN CAST(${plAdjustments.amount} AS DECIMAL) ELSE 0 END), 0)`,
        })
        .from(plAdjustments)
        .where(plAdjustmentFilters);

    const totalAdjustmentIncome = Number(plAdjustmentResult[0]?.totalIncome || 0);
    const totalAdjustmentExpense = Number(plAdjustmentResult[0]?.totalExpenseAdj || 0);

    // Profit = Net Sales (margin-adjusted, includes expenses) - Cost of Goods Sold - Bills + Adjustment Income - Adjustment Expense
    // Uses netSalesForPL (margin deduction + expenses) instead of netSales (buying price deduction) to keep P&L accurate
    const profitLoss = netSalesForPL - costOfGoodsSold - totalBills + totalAdjustmentIncome - totalAdjustmentExpense;

    // ----- DSR SALES DUE -----
    // Total outstanding customer dues from all orders (amount - collectedAmount)
    const customerDuesResult = await db
        .select({
            totalDue: sql<string>`SUM(CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL))`,
        })
        .from(orderCustomerDues);

    const dsrSalesDue = Number(customerDuesResult[0]?.totalDue || 0);

    // ----- DSR OWN DUE -----
    // Total outstanding DSR dues from all orders (amount - collectedAmount)
    // This is money that DSRs themselves owe from order adjustments
    const dsrOwnDuesResult = await db
        .select({
            totalDue: sql<string>`SUM(CAST(${orderDsrDues.amount} AS DECIMAL) - CAST(${orderDsrDues.collectedAmount} AS DECIMAL))`,
        })
        .from(orderDsrDues);

    const dsrOwnDue = Number(dsrOwnDuesResult[0]?.totalDue || 0);

    // ----- SR OWN DUE -----
    // Total outstanding SR dues from all orders (amount - collectedAmount)
    const srOwnDuesResult = await db
        .select({
            totalDue: sql<string>`SUM(CAST(${orderSrDues.amount} AS DECIMAL) - CAST(${orderSrDues.collectedAmount} AS DECIMAL))`,
        })
        .from(orderSrDues);

    const srOwnDue = Number(srOwnDuesResult[0]?.totalDue || 0);

    // ----- CASH BALANCE -----
    // Total payments received - total expenses
    let paymentFilters = undefined;

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

    const paymentsReceived = Number(paymentsReceivedResult[0]?.total || 0);

    // ----- SUPPLIER DUE -----
    // Total purchases from suppliers - total payments to suppliers
    const { supplierPurchases, supplierPayments } = await import("../../db/schema/supplier-schema");

    const supplierPurchasesResult = await db
        .select({ total: sum(supplierPurchases.amount) })
        .from(supplierPurchases);

    const supplierPaymentsResult = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments);

    // Only supplier payments from cash balance should affect cash balance calculation
    const supplierPaymentsFromCashResult = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments)
        .where(eq(supplierPayments.fromCashBalance, true));

    const totalSupplierPurchases = Number(supplierPurchasesResult[0]?.total || 0);
    const totalSupplierPayments = Number(supplierPaymentsResult[0]?.total || 0);
    const totalSupplierPaymentsFromCash = Number(supplierPaymentsFromCashResult[0]?.total || 0);
    // Positive = Supplier owes us (we've overpaid), Negative = We owe supplier
    const supplierDue = totalSupplierPayments - totalSupplierPurchases;

    // ----- CASH WITHDRAWALS -----
    // Subtract all cash withdrawals from cash balance
    const { cashWithdrawals } = await import("../../db/schema");

    let withdrawalFilters = undefined;
    if (dateRange?.startDate) {
        withdrawalFilters = and(
            gte(cashWithdrawals.withdrawalDate, dateRange.startDate),
            dateRange.endDate ? lte(cashWithdrawals.withdrawalDate, dateRange.endDate) : undefined
        );
    }

    const withdrawalsResult = await db
        .select({ total: sum(cashWithdrawals.amount) })
        .from(cashWithdrawals)
        .where(withdrawalFilters);

    const totalWithdrawals = Number(withdrawalsResult[0]?.total || 0);

    // ----- DUE COLLECTIONS (Customer Dues Collected) -----
    // Add collected dues to cash balance
    let dueCollectionFilters = undefined;
    if (dateRange?.startDate) {
        dueCollectionFilters = and(
            gte(dueCollections.collectionDate, dateRange.startDate),
            dateRange.endDate ? lte(dueCollections.collectionDate, dateRange.endDate) : undefined
        );
    }

    const dueCollectionsResult = await db
        .select({ total: sum(dueCollections.amount) })
        .from(dueCollections)
        .where(dueCollectionFilters);

    const totalDueCollections = Number(dueCollectionsResult[0]?.total || 0);

    // ----- DSR DUE COLLECTIONS (DSR Own Dues Collected) -----
    // Add collected DSR dues to cash balance
    let dsrDueCollectionFilters = undefined;
    if (dateRange?.startDate) {
        dsrDueCollectionFilters = and(
            gte(dsrDueCollections.collectionDate, dateRange.startDate),
            dateRange.endDate ? lte(dsrDueCollections.collectionDate, dateRange.endDate) : undefined
        );
    }

    const dsrDueCollectionsResult = await db
        .select({ total: sum(dsrDueCollections.amount) })
        .from(dsrDueCollections)
        .where(dsrDueCollectionFilters);

    const totalDsrDueCollections = Number(dsrDueCollectionsResult[0]?.total || 0);

    // ----- SR DUE COLLECTIONS (SR Own Dues Collected) -----
    // Add collected SR dues to cash balance
    let srDueCollectionFilters = undefined;
    if (dateRange?.startDate) {
        srDueCollectionFilters = and(
            gte(srDueCollections.collectionDate, dateRange.startDate),
            dateRange.endDate ? lte(srDueCollections.collectionDate, dateRange.endDate) : undefined
        );
    }

    const srDueCollectionsResult = await db
        .select({ total: sum(srDueCollections.amount) })
        .from(srDueCollections)
        .where(srDueCollectionFilters);

    const totalSrDueCollections = Number(srDueCollectionsResult[0]?.total || 0);

    // Cash Balance = Payments Received + Due Collections + DSR Due Collections + SR Due Collections - Supplier Payments (from cash only) - Cash Withdrawals - Bills
    // Note: DSR expenses are NOT deducted here because DSR gives net payment (already deducted their expenses before paying)
    const cashBalance = paymentsReceived + totalDueCollections + totalDsrDueCollections + totalSrDueCollections - totalSupplierPaymentsFromCash - totalWithdrawals - totalBills;

    // ----- DAMAGE RETURNS VALUE (at cost — unclaimed only, since claimed amounts are already in supplierDue) -----
    const { damageClaims } = await import("../../db/schema/damage-claims-schema");

    const damageValueResult = await db
        .select({ totalAtCost: sql<string>`COALESCE(SUM(CAST(${orderDamageItems.unitPrice} AS DECIMAL) * ${orderDamageItems.quantity}), 0)` })
        .from(orderDamageItems);
    const totalDamageAtCost = Number(damageValueResult[0]?.totalAtCost || 0);

    const claimedResult = await db
        .select({ totalClaimed: sql<string>`COALESCE(SUM(CAST(${damageClaims.amount} AS DECIMAL)), 0)` })
        .from(damageClaims);
    const totalClaimed = Number(claimedResult[0]?.totalClaimed || 0);

    // Only unclaimed damage value counts as an asset (claimed amounts are already reflected in supplierDue)
    const damageReturnsValue = Math.max(0, totalDamageAtCost - totalClaimed);

    // ----- PENDING ORDERS VALUE (at cost) -----
    // Orders with status 'pending' have already deducted stock but have no payment/due recorded yet.
    // We add back the COST of those items (not selling price) to neutralize the stock deduction.
    // This ensures pending orders have zero effect on net assets (conservative — no unrealized profit).
    const pendingOrderIds = await db
        .select({ id: wholesaleOrders.id })
        .from(wholesaleOrders)
        .where(eq(wholesaleOrders.status, 'pending'));

    let pendingOrdersValue = 0;
    let pendingSalesTotal = 0;
    if (pendingOrderIds.length > 0) {
        // Cost-based value (for net assets neutralization)
        const pendingItemsResult = await db
            .select({
                totalCost: sql<string>`COALESCE(SUM(CAST(${stockBatch.supplierPrice} AS DECIMAL) * ${wholesaleOrderItems.totalQuantity}), 0)`,
            })
            .from(wholesaleOrderItems)
            .innerJoin(stockBatch, eq(wholesaleOrderItems.batchId, stockBatch.id))
            .where(sql`${wholesaleOrderItems.orderId} IN (${sql.join(pendingOrderIds.map(o => sql`${o.id}`), sql`, `)})`);
        pendingOrdersValue = Number(pendingItemsResult[0]?.totalCost || 0);

        // Selling price total (for display — shows pending sales awaiting adjustment)
        const pendingSalesResult = await db
            .select({ total: sum(wholesaleOrders.total) })
            .from(wholesaleOrders)
            .where(eq(wholesaleOrders.status, 'pending'));
        pendingSalesTotal = Number(pendingSalesResult[0]?.total || 0);
    }

    // ----- NET ASSETS -----
    // Total business value = Assets - Liabilities
    // Assets: Current Stock + Cash Balance + Receivables (DSR Sales Due + DSR Own Due + SR Own Due + Pending Orders) + Damage Returns (at cost)
    // Liabilities: Supplier Due (if negative, we owe them)
    // Supplier Balance: positive = they owe us (add), negative = we owe them (subtract)
    const netAssets = currentStock + cashBalance + dsrSalesDue + dsrOwnDue + srOwnDue + supplierDue + damageReturnsValue + pendingOrdersValue;

    return {
        netSales: Math.round(netSales * 100) / 100,
        netPurchase: Math.round(netPurchase * 100) / 100,
        currentStock: Math.round(currentStock * 100) / 100,
        profitLoss: Math.round(profitLoss * 100) / 100,
        dsrSalesDue: Math.round(dsrSalesDue * 100) / 100,
        dsrOwnDue: Math.round(dsrOwnDue * 100) / 100,
        srOwnDue: Math.round(srOwnDue * 100) / 100,
        cashBalance: Math.round(cashBalance * 100) / 100,
        supplierDue: Math.round(supplierDue * 100) / 100,
        netAssets: Math.round(netAssets * 100) / 100,
        damageReturnsValue: Math.round(damageReturnsValue * 100) / 100,
        pendingOrdersValue: Math.round(pendingOrdersValue * 100) / 100,
        pendingSalesTotal: Math.round(pendingSalesTotal * 100) / 100,
    };
}

/**
 * Get current cash balance (without date filters)
 * Used for withdrawal validation to ensure cash balance doesn't go negative
 */
export async function getCurrentCashBalance(): Promise<number> {
    const { supplierPayments } = await import("../../db/schema/supplier-schema");
    const { cashWithdrawals } = await import("../../db/schema");

    // Total payments received (all time)
    const paymentsReceivedResult = await db
        .select({
            total: sum(orderPayments.amount),
        })
        .from(orderPayments);

    const paymentsReceived = Number(paymentsReceivedResult[0]?.total || 0);

    // Total supplier payments from cash balance only (all time)
    const supplierPaymentsFromCashResult = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments)
        .where(eq(supplierPayments.fromCashBalance, true));

    const totalSupplierPaymentsFromCash = Number(supplierPaymentsFromCashResult[0]?.total || 0);

    // Total withdrawals (all time)
    const withdrawalsResult = await db
        .select({ total: sum(cashWithdrawals.amount) })
        .from(cashWithdrawals);

    const totalWithdrawals = Number(withdrawalsResult[0]?.total || 0);

    // Total due collections (customer dues collected) - all time
    const dueCollectionsResult = await db
        .select({ total: sum(dueCollections.amount) })
        .from(dueCollections);

    const totalDueCollections = Number(dueCollectionsResult[0]?.total || 0);

    // Total DSR due collections (DSR own dues collected) - all time
    const dsrDueCollectionsResult = await db
        .select({ total: sum(dsrDueCollections.amount) })
        .from(dsrDueCollections);

    const totalDsrDueCollections = Number(dsrDueCollectionsResult[0]?.total || 0);

    // Total bills (all time)
    const billsResult = await db
        .select({ total: sum(bills.amount) })
        .from(bills);

    const totalBills = Number(billsResult[0]?.total || 0);

    // Total SR due collections (SR own dues collected) - all time
    const srDueCollectionsResult = await db
        .select({ total: sum(srDueCollections.amount) })
        .from(srDueCollections);

    const totalSrDueCollections = Number(srDueCollectionsResult[0]?.total || 0);

    // Cash Balance = Payments Received + Due Collections + DSR Due Collections + SR Due Collections - Supplier Payments (from cash only) - Cash Withdrawals - Bills
    // Note: DSR expenses are NOT deducted here because DSR gives net payment (already deducted their expenses before paying)
    const cashBalance = paymentsReceived + totalDueCollections + totalDsrDueCollections + totalSrDueCollections - totalSupplierPaymentsFromCash - totalWithdrawals - totalBills;

    return Math.round(cashBalance * 100) / 100;
}

// ==================== MONEY FLOW DETAILS ====================

export interface MoneyFlowBatch {
    batchId: number;
    productName: string;
    variantLabel: string;
    buyPrice: number;
    sellPrice: number;
    initialQuantity: number;
    remainingQuantity: number;
    soldQuantity: number;
    purchaseValue: number;
    stockValue: number;
    soldAtCost: number;
    soldAtSell: number;
    createdAt: Date;
}

export interface MoneyFlowOrderSummary {
    orderId: number;
    orderNumber: string;
    orderDate: string;
    dsrName: string;
    routeName: string;
    status: string;
    orderTotal: number;
    totalPayments: number;
    totalExpenses: number;
    totalReturns: number;
    totalAdjustmentDiscount: number;
    totalCustomerDues: number;
    totalDsrDues: number;
    totalDamage: number;
    paidAmount: number;
}

export interface MoneyFlowDetails {
    // Stock batches
    batches: MoneyFlowBatch[];
    // Purchase & Stock
    netPurchase: number;
    currentStock: number;
    cogs: number;
    expectedRevenue: number;
    // Sales breakdown
    grossSales: number;
    totalOrders: number;
    totalReturns: number;
    totalAdjustmentDiscounts: number;
    totalDamageProfit: number;
    totalOrderDamageLostMargin: number;
    netSales: number;
    // Cash flow
    paymentsReceived: number;
    dueCollections: number;
    dsrDueCollections: number;
    supplierPaymentsFromCash: number;
    totalWithdrawals: number;
    totalBills: number;
    totalExpenses: number;
    cashBalance: number;
    // Dues
    dsrSalesDue: number;
    dsrOwnDue: number;
    supplierPurchases: number;
    supplierPayments: number;
    supplierBalance: number;
    // Stock adjustments
    stockAdjustmentsSummary: Array<{ type: string; totalQty: number; count: number }>;
    // Orders with adjustments
    ordersSummary: MoneyFlowOrderSummary[];
    // Accounting verification
    accountingCheck: {
        netPurchase: number;
        currentStockPlusCogs: number;
        balanced: boolean;
        difference: number;
    };
    profitMargin: {
        grossProfit: number;
        profitPercent: number;
    };
    profitLoss: {
        netSales: number;
        cogsPerOrder: number;
        totalBills: number;
        totalExpenses: number;
        plAdjustmentIncome: number;
        plAdjustmentExpense: number;
        profitLoss: number;
    };
    // Detail lists for drill-down
    details: {
        bills: Array<{ id: number; title: string; amount: number; date: string; note?: string }>;
        withdrawals: Array<{ id: number; amount: number; date: string; note?: string }>;
        dueCollectionsList: Array<{ id: number; amount: number; date: string; method?: string; note?: string }>;
        dsrDueCollectionsList: Array<{ id: number; amount: number; date: string; method?: string; note?: string }>;
        plAdjustments: Array<{ id: number; title: string; type: string; amount: number; date: string; note?: string }>;
        payments: Array<{ id: number; orderId: number; orderNumber: string; amount: number; date: string; method?: string; note?: string }>;
        expenses: Array<{ id: number; orderId: number; orderNumber: string; amount: number; type: string; note?: string }>;
        returns: Array<{ id: number; orderId: number; orderNumber: string; returnAmount: number; adjustmentDiscount: number }>;
    };
}

/**
 * Get comprehensive money flow details for the tracker page
 */
export async function getMoneyFlowDetails(): Promise<MoneyFlowDetails> {
    // ----- STOCK BATCHES -----
    const batchesResult = await db
        .select({
            batchId: stockBatch.id,
            productName: product.name,
            variantLabel: productVariant.label,
            buyPrice: stockBatch.supplierPrice,
            sellPrice: stockBatch.sellPrice,
            initialQuantity: stockBatch.initialQuantity,
            remainingQuantity: stockBatch.remainingQuantity,
            createdAt: stockBatch.createdAt,
        })
        .from(stockBatch)
        .innerJoin(productVariant, eq(stockBatch.variantId, productVariant.id))
        .innerJoin(product, eq(productVariant.productId, product.id))
        .orderBy(product.name, productVariant.label, stockBatch.createdAt);

    const batches: MoneyFlowBatch[] = batchesResult.map(row => {
        const buyPrice = Number(row.buyPrice || 0);
        const sellPrice = Number(row.sellPrice || 0);
        const soldQty = row.initialQuantity - row.remainingQuantity;
        return {
            batchId: row.batchId,
            productName: row.productName,
            variantLabel: row.variantLabel,
            buyPrice,
            sellPrice,
            initialQuantity: row.initialQuantity,
            remainingQuantity: row.remainingQuantity,
            soldQuantity: soldQty,
            purchaseValue: buyPrice * row.initialQuantity,
            stockValue: buyPrice * row.remainingQuantity,
            soldAtCost: buyPrice * soldQty,
            soldAtSell: sellPrice * soldQty,
            createdAt: row.createdAt,
        };
    });

    const netPurchase = batches.reduce((sum, b) => sum + b.purchaseValue, 0);
    const currentStock = batches.reduce((sum, b) => sum + b.stockValue, 0);
    const cogs = batches.reduce((sum, b) => sum + b.soldAtCost, 0);
    const expectedRevenue = batches.reduce((sum, b) => sum + b.soldAtSell, 0);

    // ----- SALES BREAKDOWN -----
    const validOrderFilter = and(ne(wholesaleOrders.status, 'cancelled'), ne(wholesaleOrders.status, 'pending'));

    const salesResult = await db
        .select({ totalSales: sum(wholesaleOrders.total), totalOrders: count() })
        .from(wholesaleOrders)
        .where(validOrderFilter);

    const grossSales = Number(salesResult[0]?.totalSales || 0);
    const totalOrders = Number(salesResult[0]?.totalOrders || 0);

    // Returns
    const returnsResult = await db
        .select({
            totalReturns: sum(orderItemReturns.returnAmount),
            totalAdjustmentDiscounts: sum(orderItemReturns.adjustmentDiscount),
        })
        .from(orderItemReturns);
    const totalReturns = Number(returnsResult[0]?.totalReturns || 0);
    const totalAdjustmentDiscounts = Number(returnsResult[0]?.totalAdjustmentDiscounts || 0);

    // Damage returns (approved)
    const damageReturnsResult = await db
        .select({
            totalProfit: sql<number>`sum((COALESCE(${stockBatch.sellPrice}, 0) - ${damageReturnItems.unitPrice}) * ${damageReturnItems.quantity})`,
        })
        .from(damageReturns)
        .innerJoin(damageReturnItems, eq(damageReturns.id, damageReturnItems.returnId))
        .leftJoin(stockBatch, eq(damageReturnItems.batchId, stockBatch.id))
        .where(eq(damageReturns.status, 'approved'));
    const totalDamageProfit = Number(damageReturnsResult[0]?.totalProfit || 0);

    // Order damage items — both margin (for P&L) and buying price (for Net Sales display)
    const orderDamageResult = await db
        .select({
            lostMargin: sql<number>`sum((${orderDamageItems.sellingPrice} - ${orderDamageItems.unitPrice}) * ${orderDamageItems.quantity})`,
            totalCost: sql<number>`sum(CAST(${orderDamageItems.unitPrice} AS DECIMAL) * ${orderDamageItems.quantity})`,
        })
        .from(orderDamageItems);
    const totalOrderDamageLostMargin = Number(orderDamageResult[0]?.lostMargin || 0);
    const totalOrderDamageCost = Number(orderDamageResult[0]?.totalCost || 0);

    // ----- EXPENSES (needed for Net Sales) -----
    const expensesResult = await db.select({ total: sum(orderExpenses.amount) }).from(orderExpenses);
    const totalExpensesAmount = Number(expensesResult[0]?.total || 0);

    // Net Sales (display): deducts damage at buying price and expenses
    const netSales = grossSales - totalReturns - totalAdjustmentDiscounts - totalDamageProfit - totalOrderDamageCost - totalExpensesAmount;

    // Net Sales for P&L: deducts only the lost margin and expenses
    const netSalesForPL = grossSales - totalReturns - totalAdjustmentDiscounts - totalDamageProfit - totalOrderDamageLostMargin - totalExpensesAmount;

    // ----- CASH FLOW -----
    const paymentsReceivedResult = await db.select({ total: sum(orderPayments.amount) }).from(orderPayments);
    const paymentsReceived = Number(paymentsReceivedResult[0]?.total || 0);

    const dueCollectionsResult = await db.select({ total: sum(dueCollections.amount) }).from(dueCollections);
    const totalDueCollections = Number(dueCollectionsResult[0]?.total || 0);

    const dsrDueCollectionsResult = await db.select({ total: sum(dsrDueCollections.amount) }).from(dsrDueCollections);
    const totalDsrDueCollections = Number(dsrDueCollectionsResult[0]?.total || 0);

    const { supplierPurchases: supplierPurchasesTable, supplierPayments: supplierPaymentsTable } = await import("../../db/schema/supplier-schema");

    const supplierPaymentsFromCashResult = await db
        .select({ total: sum(supplierPaymentsTable.amount) })
        .from(supplierPaymentsTable)
        .where(eq(supplierPaymentsTable.fromCashBalance, true));
    const supplierPaymentsFromCash = Number(supplierPaymentsFromCashResult[0]?.total || 0);

    const withdrawalsResult = await db.select({ total: sum(cashWithdrawals.amount) }).from(cashWithdrawals);
    const totalWithdrawals = Number(withdrawalsResult[0]?.total || 0);

    const billsResult = await db.select({ total: sum(bills.amount) }).from(bills);
    const totalBillsAmount = Number(billsResult[0]?.total || 0);


    const cashBalance = paymentsReceived + totalDueCollections + totalDsrDueCollections - supplierPaymentsFromCash - totalWithdrawals - totalBillsAmount;

    // ----- DUES -----
    const customerDuesResult = await db
        .select({ totalDue: sql<string>`SUM(CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL))` })
        .from(orderCustomerDues);
    const dsrSalesDue = Number(customerDuesResult[0]?.totalDue || 0);

    const dsrOwnDuesResult = await db
        .select({ totalDue: sql<string>`SUM(CAST(${orderDsrDues.amount} AS DECIMAL) - CAST(${orderDsrDues.collectedAmount} AS DECIMAL))` })
        .from(orderDsrDues);
    const dsrOwnDue = Number(dsrOwnDuesResult[0]?.totalDue || 0);

    const supplierPurchasesResult = await db.select({ total: sum(supplierPurchasesTable.amount) }).from(supplierPurchasesTable);
    const totalSupplierPurchases = Number(supplierPurchasesResult[0]?.total || 0);

    const supplierPaymentsAllResult = await db.select({ total: sum(supplierPaymentsTable.amount) }).from(supplierPaymentsTable);
    const totalSupplierPayments = Number(supplierPaymentsAllResult[0]?.total || 0);
    const supplierBalance = totalSupplierPayments - totalSupplierPurchases;

    // ----- STOCK ADJUSTMENTS -----
    const adjustmentsResult = await db
        .select({
            adjustmentType: stockAdjustments.adjustmentType,
            totalQty: sum(stockAdjustments.quantity),
            cnt: count(),
        })
        .from(stockAdjustments)
        .groupBy(stockAdjustments.adjustmentType);

    const stockAdjustmentsSummary = adjustmentsResult.map(r => ({
        type: r.adjustmentType,
        totalQty: Number(r.totalQty || 0),
        count: Number(r.cnt || 0),
    }));

    // ----- ORDERS WITH ADJUSTMENT SUMMARY -----
    const ordersWithAdjustments = await db.query.wholesaleOrders.findMany({
        where: validOrderFilter,
        with: { dsr: true, route: true },
        orderBy: [desc(wholesaleOrders.orderDate)],
    }) as any[];

    const orderIds = ordersWithAdjustments.map(o => o.id);

    // Batch-fetch all adjustment data
    let paymentsMap = new Map<number, number>();
    let expensesMap = new Map<number, number>();
    let returnsMap = new Map<number, { amount: number; discount: number }>();
    let customerDuesMap = new Map<number, number>();
    let dsrDuesMap = new Map<number, number>();
    let damageMap = new Map<number, number>();

    if (orderIds.length > 0) {
        // Payments per order
        const paymentsByOrder = await db
            .select({ orderId: orderPayments.orderId, total: sum(orderPayments.amount) })
            .from(orderPayments).groupBy(orderPayments.orderId);
        for (const r of paymentsByOrder) paymentsMap.set(r.orderId, Number(r.total || 0));

        // Expenses per order
        const expensesByOrder = await db
            .select({ orderId: orderExpenses.orderId, total: sum(orderExpenses.amount) })
            .from(orderExpenses).groupBy(orderExpenses.orderId);
        for (const r of expensesByOrder) expensesMap.set(r.orderId, Number(r.total || 0));

        // Returns per order
        const returnsByOrder = await db
            .select({
                orderId: orderItemReturns.orderId,
                totalReturns: sum(orderItemReturns.returnAmount),
                totalDiscount: sum(orderItemReturns.adjustmentDiscount),
            })
            .from(orderItemReturns).groupBy(orderItemReturns.orderId);
        for (const r of returnsByOrder) returnsMap.set(r.orderId, {
            amount: Number(r.totalReturns || 0), discount: Number(r.totalDiscount || 0)
        });

        // Customer dues per order
        const custDuesByOrder = await db
            .select({ orderId: orderCustomerDues.orderId, total: sum(orderCustomerDues.amount) })
            .from(orderCustomerDues).groupBy(orderCustomerDues.orderId);
        for (const r of custDuesByOrder) customerDuesMap.set(r.orderId, Number(r.total || 0));

        // DSR dues per order
        const dsrDuesByOrder = await db
            .select({ orderId: orderDsrDues.orderId, total: sum(orderDsrDues.amount) })
            .from(orderDsrDues).groupBy(orderDsrDues.orderId);
        for (const r of dsrDuesByOrder) dsrDuesMap.set(r.orderId, Number(r.total || 0));

        // Damage items per order
        const damageByOrder = await db
            .select({ orderId: orderDamageItems.orderId, total: sum(orderDamageItems.total) })
            .from(orderDamageItems).groupBy(orderDamageItems.orderId);
        for (const r of damageByOrder) damageMap.set(r.orderId, Number(r.total || 0));
    }

    const ordersSummary: MoneyFlowOrderSummary[] = ordersWithAdjustments.map((o: any) => {
        const returns = returnsMap.get(o.id);
        return {
            orderId: o.id,
            orderNumber: o.orderNumber,
            orderDate: o.orderDate,
            dsrName: o.dsr?.name || '—',
            routeName: o.route?.name || '—',
            status: o.status,
            orderTotal: Number(o.total || 0),
            totalPayments: paymentsMap.get(o.id) || 0,
            totalExpenses: expensesMap.get(o.id) || 0,
            totalReturns: returns?.amount || 0,
            totalAdjustmentDiscount: returns?.discount || 0,
            totalCustomerDues: customerDuesMap.get(o.id) || 0,
            totalDsrDues: dsrDuesMap.get(o.id) || 0,
            totalDamage: damageMap.get(o.id) || 0,
            paidAmount: Number(o.paidAmount || 0),
        };
    });

    // ----- COGS PER ORDER (same as dashboard calculation) -----
    let cogsPerOrder = 0;
    if (orderIds.length > 0) {
        const orderItemsResult = await db
            .select({ item: wholesaleOrderItems, batch: stockBatch })
            .from(wholesaleOrderItems)
            .innerJoin(stockBatch, eq(wholesaleOrderItems.batchId, stockBatch.id))
            .where(sql`${wholesaleOrderItems.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

        const returnsForCogs = await db
            .select({
                orderItemId: orderItemReturns.orderItemId,
                returnQuantity: orderItemReturns.returnQuantity,
                returnUnit: orderItemReturns.returnUnit,
                returnExtraPieces: orderItemReturns.returnExtraPieces,
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

        const returnQtyMap = new Map<number, number>();
        for (const ret of returnsForCogs) {
            const unitMultiplier = await getUnitMultiplier(ret.returnUnit || 'PCS');
            const returnInBase = (ret.returnQuantity * unitMultiplier) + (ret.returnExtraPieces || 0);
            returnQtyMap.set(ret.orderItemId, returnInBase);
        }

        cogsPerOrder = orderItemsResult.reduce((sum, row) => {
            const supplierPrice = Number(row.batch.supplierPrice || 0);
            const totalQty = row.item.totalQuantity || 0;
            const returnQty = returnQtyMap.get(row.item.id) || 0;
            return sum + (supplierPrice * (totalQty - returnQty));
        }, 0);
    }

    // ----- P&L ADJUSTMENTS -----
    const plAdjustmentResult = await db
        .select({
            totalIncome: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.type} = 'income' THEN CAST(${plAdjustments.amount} AS DECIMAL) ELSE 0 END), 0)`,
            totalExpenseAdj: sql<string>`COALESCE(SUM(CASE WHEN ${plAdjustments.type} = 'expense' THEN CAST(${plAdjustments.amount} AS DECIMAL) ELSE 0 END), 0)`,
        })
        .from(plAdjustments);
    const plAdjustmentIncome = Number(plAdjustmentResult[0]?.totalIncome || 0);
    const plAdjustmentExpense = Number(plAdjustmentResult[0]?.totalExpenseAdj || 0);

    // Profit = Net Sales (includes expenses) - COGS (per order) - Bills + PL Adj Income - PL Adj Expense
    const profitLossValue = netSalesForPL - cogsPerOrder - totalBillsAmount + plAdjustmentIncome - plAdjustmentExpense;

    // ----- ACCOUNTING VERIFICATION -----
    const currentStockPlusCogs = currentStock + cogs;
    const grossProfit = netSales - cogs;
    const profitPercent = cogs > 0 ? (grossProfit / cogs) * 100 : 0;

    // ----- DETAIL LISTS FOR DRILL-DOWN -----
    // Bills list
    const billsList = await db.select().from(bills).orderBy(desc(bills.billDate));
    const billsDetail = billsList.map(b => ({
        id: b.id, title: b.title, amount: Number(b.amount), date: b.billDate, note: b.note || undefined,
    }));

    // Withdrawals list
    const withdrawalsList = await db.select().from(cashWithdrawals).orderBy(desc(cashWithdrawals.withdrawalDate));
    const withdrawalsDetail = withdrawalsList.map(w => ({
        id: w.id, amount: Number(w.amount), date: w.withdrawalDate, note: w.note || undefined,
    }));

    // Due collections list
    const dueCollectionsFull = await db.select().from(dueCollections).orderBy(desc(dueCollections.collectionDate));
    const dueCollectionsDetail = dueCollectionsFull.map(d => ({
        id: d.id, amount: Number(d.amount), date: d.collectionDate, method: d.paymentMethod || undefined, note: d.note || undefined,
    }));

    // DSR due collections list
    const dsrDueCollectionsFull = await db.select().from(dsrDueCollections).orderBy(desc(dsrDueCollections.collectionDate));
    const dsrDueCollectionsDetail = dsrDueCollectionsFull.map(d => ({
        id: d.id, amount: Number(d.amount), date: d.collectionDate, method: d.paymentMethod || undefined, note: d.note || undefined,
    }));

    // P&L adjustments list
    const plAdjustmentsFull = await db.select().from(plAdjustments).orderBy(desc(plAdjustments.adjustmentDate));
    const plAdjustmentsDetail = plAdjustmentsFull.map(p => ({
        id: p.id, title: p.title, type: p.type, amount: Number(p.amount), date: p.adjustmentDate, note: p.note || undefined,
    }));

    // Build order number map for payments/expenses/returns
    const orderNumberMap = new Map<number, string>();
    for (const o of ordersWithAdjustments) orderNumberMap.set(o.id, (o as any).orderNumber);

    // All payments with order info
    const allPayments = await db.select().from(orderPayments).orderBy(desc(orderPayments.paymentDate));
    const paymentsDetail = allPayments.map(p => ({
        id: p.id, orderId: p.orderId, orderNumber: orderNumberMap.get(p.orderId) || `#${p.orderId}`,
        amount: Number(p.amount), date: p.paymentDate, method: p.paymentMethod || undefined, note: p.note || undefined,
    }));

    // All expenses with order info
    const allExpenses = await db.select().from(orderExpenses).orderBy(desc(orderExpenses.createdAt));
    const expensesDetail = allExpenses.map(e => ({
        id: e.id, orderId: e.orderId, orderNumber: orderNumberMap.get(e.orderId) || `#${e.orderId}`,
        amount: Number(e.amount), type: e.expenseType, note: e.note || undefined,
    }));

    // All returns with order info
    const allReturns = await db.select().from(orderItemReturns).orderBy(desc(orderItemReturns.createdAt));
    const returnsDetail = allReturns
        .filter(r => Number(r.returnAmount) > 0 || Number(r.adjustmentDiscount || 0) > 0)
        .map(r => ({
            id: r.id, orderId: r.orderId, orderNumber: orderNumberMap.get(r.orderId) || `#${r.orderId}`,
            returnAmount: Number(r.returnAmount), adjustmentDiscount: Number(r.adjustmentDiscount || 0),
        }));

    return {
        batches,
        netPurchase: Math.round(netPurchase * 100) / 100,
        currentStock: Math.round(currentStock * 100) / 100,
        cogs: Math.round(cogs * 100) / 100,
        expectedRevenue: Math.round(expectedRevenue * 100) / 100,
        grossSales: Math.round(grossSales * 100) / 100,
        totalOrders,
        totalReturns: Math.round(totalReturns * 100) / 100,
        totalAdjustmentDiscounts: Math.round(totalAdjustmentDiscounts * 100) / 100,
        totalDamageProfit: Math.round(totalDamageProfit * 100) / 100,
        totalOrderDamageLostMargin: Math.round(totalOrderDamageLostMargin * 100) / 100,
        netSales: Math.round(netSales * 100) / 100,
        paymentsReceived: Math.round(paymentsReceived * 100) / 100,
        dueCollections: Math.round(totalDueCollections * 100) / 100,
        dsrDueCollections: Math.round(totalDsrDueCollections * 100) / 100,
        supplierPaymentsFromCash: Math.round(supplierPaymentsFromCash * 100) / 100,
        totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
        totalBills: Math.round(totalBillsAmount * 100) / 100,
        totalExpenses: Math.round(totalExpensesAmount * 100) / 100,
        cashBalance: Math.round(cashBalance * 100) / 100,
        dsrSalesDue: Math.round(dsrSalesDue * 100) / 100,
        dsrOwnDue: Math.round(dsrOwnDue * 100) / 100,
        supplierPurchases: Math.round(totalSupplierPurchases * 100) / 100,
        supplierPayments: Math.round(totalSupplierPayments * 100) / 100,
        supplierBalance: Math.round(supplierBalance * 100) / 100,
        stockAdjustmentsSummary,
        ordersSummary,
        accountingCheck: {
            netPurchase: Math.round(netPurchase * 100) / 100,
            currentStockPlusCogs: Math.round(currentStockPlusCogs * 100) / 100,
            balanced: Math.abs(netPurchase - currentStockPlusCogs) < 0.01,
            difference: Math.round((netPurchase - currentStockPlusCogs) * 100) / 100,
        },
        profitMargin: {
            grossProfit: Math.round(grossProfit * 100) / 100,
            profitPercent: Math.round(profitPercent * 100) / 100,
        },
        profitLoss: {
            netSales: Math.round(netSales * 100) / 100,
            cogsPerOrder: Math.round(cogsPerOrder * 100) / 100,
            totalBills: Math.round(totalBillsAmount * 100) / 100,
            totalExpenses: Math.round(totalExpensesAmount * 100) / 100,
            plAdjustmentIncome: Math.round(plAdjustmentIncome * 100) / 100,
            plAdjustmentExpense: Math.round(plAdjustmentExpense * 100) / 100,
            profitLoss: Math.round(profitLossValue * 100) / 100,
        },
        details: {
            bills: billsDetail,
            withdrawals: withdrawalsDetail,
            dueCollectionsList: dueCollectionsDetail,
            dsrDueCollectionsList: dsrDueCollectionsDetail,
            plAdjustments: plAdjustmentsDetail,
            payments: paymentsDetail,
            expenses: expensesDetail,
            returns: returnsDetail,
        },
    };
}

