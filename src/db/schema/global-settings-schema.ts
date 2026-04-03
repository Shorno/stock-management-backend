import { pgTable, serial, text, boolean, pgEnum, varchar } from "drizzle-orm/pg-core";
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
    // Inventory snapshot schedule (HH:MM format, 24h)
    snapshotTime: varchar("snapshot_time", { length: 5 }).notNull().default("23:59"),
    // Opening stock toggle
    openingStockEnabled: boolean("opening_stock_enabled").notNull().default(true),
    // Opening balance toggles (individually controllable)
    srOpeningBalanceEnabled: boolean("sr_opening_balance_enabled").notNull().default(true),
    dsrOpeningBalanceEnabled: boolean("dsr_opening_balance_enabled").notNull().default(true),
    supplierOpeningBalanceEnabled: boolean("supplier_opening_balance_enabled").notNull().default(true),
    customerOpeningDueEnabled: boolean("customer_opening_due_enabled").notNull().default(true),
    openingBalancesTabEnabled: boolean("opening_balances_tab_enabled").notNull().default(true),
    ...timestamps
});

// Type exports
export type GlobalSettings = typeof globalSettings.$inferSelect;
export type NewGlobalSettings = typeof globalSettings.$inferInsert;
