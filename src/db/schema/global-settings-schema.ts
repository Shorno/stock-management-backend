import { pgTable, serial, text, boolean, pgEnum } from "drizzle-orm/pg-core";
import { timestamps } from "../column.helpers";

/**
 * Lock mode for order edit password protection
 */
export const orderEditLockModeEnum = pgEnum("order_edit_lock_mode", ["always", "once"]);

/**
 * Global Settings table - stores app-wide configuration set by admin
 * Only one row should exist (singleton pattern)
 */
export const globalSettings = pgTable("global_settings", {
    id: serial("id").primaryKey(),
    // Order edit password protection
    orderEditPassword: text("order_edit_password"), // bcrypt hashed, null = no password set
    orderEditLockMode: orderEditLockModeEnum("order_edit_lock_mode").notNull().default("always"),
    orderEditLocked: boolean("order_edit_locked").notNull().default(false),
    ...timestamps
});

// Type exports
export type GlobalSettings = typeof globalSettings.$inferSelect;
export type NewGlobalSettings = typeof globalSettings.$inferInsert;
