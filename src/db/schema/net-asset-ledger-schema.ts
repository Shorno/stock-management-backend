import { pgTable, serial, text, decimal, varchar, date, integer } from "drizzle-orm/pg-core";
import { timestamps } from "../column.helpers";

/**
 * Net Asset Ledger — tracks every transaction that affects net assets.
 * Each row represents a single financial event with its impact on net assets.
 * Running balance is computed via SQL window function (SUM OVER ORDER BY transactionDate, id).
 */
export const netAssetLedger = pgTable("net_asset_ledger", {
    id: serial("id").primaryKey(),

    // What type of transaction (order_settlement, bill, cash_withdrawal, etc.)
    transactionType: varchar("transaction_type", { length: 50 }).notNull(),

    // Human-readable description
    description: text("description").notNull(),

    // Transaction amount (always positive)
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),

    // Net asset change: positive = increase, negative = decrease, 0 = neutral/internal transfer
    netAssetChange: decimal("net_asset_change", { precision: 12, scale: 2 }).notNull().default("0"),

    // Which component of net assets was affected (cash, stock, customerDue, dsrDue, srDue, supplierDue, damageReturns)
    affectedComponent: varchar("affected_component", { length: 50 }).notNull(),

    // Reference to the source entity
    entityType: varchar("entity_type", { length: 50 }),
    entityId: integer("entity_id"),

    // When the transaction occurred (business date)
    transactionDate: date("transaction_date").notNull(),

    // Net asset value after this transaction was recorded (snapshot)
    netAssetAfter: decimal("net_asset_after", { precision: 14, scale: 2 }),

    ...timestamps,
});

// Type exports
export type NetAssetLedgerEntry = typeof netAssetLedger.$inferSelect;
export type NewNetAssetLedgerEntry = typeof netAssetLedger.$inferInsert;
