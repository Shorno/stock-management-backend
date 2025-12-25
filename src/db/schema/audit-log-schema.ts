import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const auditLogs = pgTable(
    "audit_logs",
    {
        id: serial("id").primaryKey(),
        timestamp: timestamp("timestamp").defaultNow().notNull(),
        userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
        userName: text("user_name"),
        userRole: text("user_role"),
        action: text("action").notNull(), // CREATE, UPDATE, DELETE, LOGIN, LOGOUT, STATUS_CHANGE
        entityType: text("entity_type").notNull(), // product, order, stock, user, dsr, route, brand, category
        entityId: text("entity_id").notNull(),
        entityName: text("entity_name"),
        oldValue: jsonb("old_value"),
        newValue: jsonb("new_value"),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        metadata: jsonb("metadata"),
    },
    (table) => [
        index("audit_logs_timestamp_idx").on(table.timestamp),
        index("audit_logs_userId_idx").on(table.userId),
        index("audit_logs_entityType_idx").on(table.entityType),
        index("audit_logs_action_idx").on(table.action),
    ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
