import { and, isNull, sql } from "drizzle-orm";
import { orderExpenses } from "../../db/schema";
import type { GetCommissionsQuery } from "./validation";

/**
 * DB Point is the virtual sales identity for work that is not assigned to an SR.
 * Every unassigned order expense, regardless of expense type, is its commission.
 */
export function buildDbPointCommissionFilter(query: GetCommissionsQuery) {
    const conditions = [isNull(orderExpenses.srId)];

    if (query.startDate) {
        conditions.push(sql`(${orderExpenses.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka')::date >= ${query.startDate}::date`);
    }
    if (query.endDate) {
        conditions.push(sql`(${orderExpenses.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka')::date <= ${query.endDate}::date`);
    }

    return and(...conditions);
}
