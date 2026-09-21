import { and, eq, isNull, sql } from "drizzle-orm";
import { orderExpenses, srCommissions, wholesaleOrders } from "../../db/schema";
import type { GetCommissionsQuery } from "./validation";

export const effectiveSrCommissionDate = sql<string>`CASE
    WHEN ${srCommissions.sourceType} = 'order_adjustment' AND ${wholesaleOrders.orderDate} IS NOT NULL
        THEN ${wholesaleOrders.orderDate}
    ELSE ${srCommissions.commissionDate}
END`;

/**
 * DB Point is the virtual sales identity for work that is not assigned to an SR.
 * Every unassigned order expense, regardless of expense type, is its commission.
 */
export function buildDbPointCommissionFilter(query: GetCommissionsQuery) {
    const conditions = [isNull(orderExpenses.srId)];

    if (query.startDate) {
        conditions.push(sql`${wholesaleOrders.orderDate} >= ${query.startDate}::date`);
    }
    if (query.endDate) {
        conditions.push(sql`${wholesaleOrders.orderDate} <= ${query.endDate}::date`);
    }
    if (query.routeId) {
        conditions.push(eq(wholesaleOrders.routeId, query.routeId));
    }

    return and(...conditions);
}

export function buildSrCommissionFilter(srId: number | undefined, query: GetCommissionsQuery) {
    const conditions = [];

    if (srId !== undefined) {
        conditions.push(eq(srCommissions.srId, srId));
    }
    if (query.startDate) {
        conditions.push(sql`${effectiveSrCommissionDate} >= ${query.startDate}::date`);
    }
    if (query.endDate) {
        conditions.push(sql`${effectiveSrCommissionDate} <= ${query.endDate}::date`);
    }
    if (query.routeId) {
        conditions.push(eq(wholesaleOrders.routeId, query.routeId));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
}
