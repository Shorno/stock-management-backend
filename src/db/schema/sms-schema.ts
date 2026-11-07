import { pgTable, serial, text, boolean, integer, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { timestamps } from "../column.helpers";
import { customer, wholesaleOrders, dueCollections } from "./wholesale-schema";
import { user } from "./auth-schema";

/**
 * SMS settings (singleton). Nothing is sent until `enabled` is turned on and
 * ALPHA_SMS_API_KEY is configured on the server.
 */
export const smsSettings = pgTable("sms_settings", {
    id: serial("id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    companyName: varchar("company_name", { length: 150 }).notNull().default(""),
    autoSendOnSettlement: boolean("auto_send_on_settlement").notNull().default(true),
    autoSendOnCollection: boolean("auto_send_on_collection").notNull().default(true),
    settlementTemplate: text("settlement_template").notNull().default(""),
    collectionTemplate: text("collection_template").notNull().default(""),
    reminderTemplate: text("reminder_template").notNull().default(""),
    overdueDays: integer("overdue_days").notNull().default(30),
    ...timestamps
});

/**
 * Saved messages (notice, offer, custom reminder) that can be reused.
 */
export const smsTemplates = pgTable("sms_templates", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    body: text("body").notNull(),
    ...timestamps
});

/**
 * One row per SMS attempt.
 * type: settlement | collection | reminder | custom | test
 * status: sent | failed
 */
export const smsLogs = pgTable("sms_logs", {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").references(() => customer.id, { onDelete: "set null" }),
    recipientName: varchar("recipient_name", { length: 150 }),
    phone: varchar("phone", { length: 20 }).notNull(),
    message: text("message").notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    segments: integer("segments").notNull().default(1),
    requestId: varchar("request_id", { length: 50 }),
    error: text("error"),
    orderId: integer("order_id").references(() => wholesaleOrders.id, { onDelete: "set null" }),
    dueCollectionId: integer("due_collection_id").references(() => dueCollections.id, { onDelete: "set null" }),
    sentByUserId: text("sent_by_user_id").references(() => user.id, { onDelete: "set null" }),
    sentByName: varchar("sent_by_name", { length: 150 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    createdIdx: index("idx_sms_logs_created").on(table.createdAt),
    customerIdx: index("idx_sms_logs_customer").on(table.customerId),
    typeIdx: index("idx_sms_logs_type").on(table.type),
}));

export type SmsSettings = typeof smsSettings.$inferSelect;
export type SmsTemplate = typeof smsTemplates.$inferSelect;
export type SmsLog = typeof smsLogs.$inferSelect;
export type NewSmsLog = typeof smsLogs.$inferInsert;
