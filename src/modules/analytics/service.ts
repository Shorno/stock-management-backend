import { db } from "../../db/config";
import { wholesaleOrders, wholesaleOrderItems, dsr, route } from "../../db/schema";
import { product } from "../../db/schema";
import { eq, and, gte, lte, desc, sum, count } from "drizzle-orm";

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
    // Get completed orders sales
    const completedFilter = eq(wholesaleOrders.status, 'completed');
    const allCompletedFilters = dateFilters.length > 0
        ? and(completedFilter, ...dateFilters)
        : completedFilter;

    const salesResult = await db
        .select({
            totalSales: sum(wholesaleOrders.total),
        })
        .from(wholesaleOrders)
        .where(allCompletedFilters);

    // Get total orders count
    const ordersResult = await db
        .select({
            totalOrders: count(),
        })
        .from(wholesaleOrders)
        .where(dateFilters.length > 0 ? and(...dateFilters) : undefined);

    // Get returns count
    const returnFilter = eq(wholesaleOrders.status, 'return');
    const allReturnFilters = dateFilters.length > 0
        ? and(returnFilter, ...dateFilters)
        : returnFilter;

    const returnsResult = await db
        .select({
            totalReturns: count(),
        })
        .from(wholesaleOrders)
        .where(allReturnFilters);

    // Calculate profit from order items
    const profitResult = await db
        .select({
            totalProfit: sum(wholesaleOrderItems.net),
        })
        .from(wholesaleOrderItems)
        .innerJoin(wholesaleOrders, eq(wholesaleOrderItems.orderId, wholesaleOrders.id))
        .where(allCompletedFilters);

    return {
        totalSales: Number(salesResult[0]?.totalSales || 0),
        totalOrders: Number(ordersResult[0]?.totalOrders || 0),
        totalReturns: Number(returnsResult[0]?.totalReturns || 0),
        totalProfit: Number(profitResult[0]?.totalProfit || 0) * 0.15, // Simplified profit margin
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
    const completedFilter = eq(wholesaleOrders.status, 'completed');
    const allFilters = dateFilters.length > 0
        ? and(completedFilter, ...dateFilters)
        : completedFilter;

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
    const completedFilter = eq(wholesaleOrders.status, 'completed');

    const allFilters = dateFilters.length > 0
        ? and(completedFilter, ...dateFilters)
        : completedFilter;

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

    return result.map(r => ({
        dsrId: r.dsrId,
        dsrName: r.dsrName,
        totalSales: Number(r.totalSales || 0),
        orderCount: Number(r.orderCount || 0),
    }));
}

export async function getSalesByRoute(dateRange?: DateRange): Promise<SalesByRouteItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const completedFilter = eq(wholesaleOrders.status, 'completed');

    const allFilters = dateFilters.length > 0
        ? and(completedFilter, ...dateFilters)
        : completedFilter;

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

    return result.map(r => ({
        routeId: r.routeId,
        routeName: r.routeName,
        totalSales: Number(r.totalSales || 0),
        orderCount: Number(r.orderCount || 0),
    }));
}

export async function getTopProducts(limit: number = 10, dateRange?: DateRange): Promise<TopProductItem[]> {
    const dateFilters = getDateFilter(dateRange?.startDate, dateRange?.endDate);
    const completedFilter = eq(wholesaleOrders.status, 'completed');

    const allFilters = dateFilters.length > 0
        ? and(completedFilter, ...dateFilters)
        : completedFilter;

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
