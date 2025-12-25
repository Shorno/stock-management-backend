import { db } from "../../db/config";
import { auditLogs } from "../../db/schema";
import { desc, and, eq, gte, lte, ilike, or } from "drizzle-orm";

export interface GetAuditLogsQuery {
    search?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}

export async function getLogs(query: GetAuditLogsQuery) {
    const {
        search,
        userId,
        action,
        entityType,
        startDate,
        endDate,
        limit = 50,
        offset = 0,
    } = query;

    const conditions = [];

    if (userId) {
        conditions.push(eq(auditLogs.userId, userId));
    }

    if (action) {
        conditions.push(eq(auditLogs.action, action));
    }

    if (entityType) {
        conditions.push(eq(auditLogs.entityType, entityType));
    }

    if (startDate) {
        conditions.push(gte(auditLogs.timestamp, new Date(startDate)));
    }

    if (endDate) {
        conditions.push(lte(auditLogs.timestamp, new Date(endDate)));
    }

    if (search) {
        conditions.push(
            or(
                ilike(auditLogs.userName, `%${search}%`),
                ilike(auditLogs.entityName, `%${search}%`),
                ilike(auditLogs.entityId, `%${search}%`)
            )!
        );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit)
        .offset(offset);

    // Get total count
    const totalResult = await db
        .select({ count: auditLogs.id })
        .from(auditLogs)
        .where(whereClause);

    return {
        logs,
        total: totalResult.length,
    };
}

export async function getLogById(id: number) {
    const log = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, id))
        .limit(1);

    return log[0];
}
