import { and, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { wholesaleOrders, wholesaleOrderItems } from "../../db/schema";
import type { GetOrdersQuery } from "./validation";

// The list and its count must use the same predicates before applying pagination.
export function buildOrderFilters(query: GetOrdersQuery) {
    const conditions = [];
    if (query.search) conditions.push(ilike(wholesaleOrders.orderNumber, `%${query.search}%`));
    if (query.dsrId) conditions.push(eq(wholesaleOrders.dsrId, query.dsrId));
    if (query.dsrIds?.length) conditions.push(inArray(wholesaleOrders.dsrId, query.dsrIds));
    if (query.srIds?.length) {
        // An SR belongs to order items. IN finds the order once, even when several
        // items or selected SRs match, while retaining the complete order totals.
        const matchingOrders = new QueryBuilder()
            .select({ orderId: wholesaleOrderItems.orderId })
            .from(wholesaleOrderItems)
            .where(inArray(wholesaleOrderItems.srId, query.srIds));
        conditions.push(inArray(wholesaleOrders.id, matchingOrders));
    }
    if (query.routeId) conditions.push(eq(wholesaleOrders.routeId, query.routeId));
    if (query.categoryId) conditions.push(eq(wholesaleOrders.categoryId, query.categoryId));
    if (query.brandId) conditions.push(eq(wholesaleOrders.brandId, query.brandId));
    if (query.status) conditions.push(eq(wholesaleOrders.status, query.status));
    if (query.startDate) conditions.push(gte(wholesaleOrders.orderDate, query.startDate));
    if (query.endDate) conditions.push(lte(wholesaleOrders.orderDate, query.endDate));
    return and(...conditions);
}
