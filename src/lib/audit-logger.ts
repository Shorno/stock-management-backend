import { db } from "../db/config";
import { auditLogs, type NewAuditLog } from "../db/schema";
import type { Context } from "hono";

/**
 * Helper function to create audit log entries
 */
export async function auditLog(params: {
    context?: Context;
    userId?: string | null;
    userName?: string;
    userRole?: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "STATUS_CHANGE" | "VIEW";
    entityType: "product" | "order" | "stock" | "user" | "dsr" | "route" | "brand" | "category" | "wholesale_order" | "variant" | "unit";
    entityId: string | number;
    entityName?: string;
    oldValue?: any;
    newValue?: any;
    metadata?: Record<string, any>;
}): Promise<void> {
    try {
        const {
            context,
            userId,
            userName,
            userRole,
            action,
            entityType,
            entityId,
            entityName,
            oldValue,
            newValue,
            metadata,
        } = params;

        // Extract IP and User Agent from context if provided
        let ipAddress: string | undefined;
        let userAgent: string | undefined;

        if (context) {
            const req = context.req;
            ipAddress = req.header("x-forwarded-for") || req.header("x-real-ip");
            userAgent = req.header("user-agent");
        }

        const logEntry: NewAuditLog = {
            userId: userId || null,
            userName: userName || null,
            userRole: userRole || null,
            action,
            entityType,
            entityId: String(entityId),
            entityName: entityName || null,
            oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
            newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        };

        await db.insert(auditLogs).values(logEntry);
    } catch (error) {
        // Log errors but don't throw to avoid breaking the main operation
        console.error("Failed to create audit log:", error);
    }
}

/**
 * Extract user info from Hono context
 */
export function getUserInfoFromContext(context: Context): {
    userId?: string;
    userName?: string;
    userRole?: string;
} {
    const user = context.get("user");
    return {
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
    };
}
