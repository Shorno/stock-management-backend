import { pgTable, serial, varchar, integer, decimal, date, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";

/**
 * Opening Balances - stores pre-existing financial state when migrating an existing business.
 * Each entity (customer, DSR, SR, brand) can have at most one opening balance per type.
 * Global types (cash, investment, profit_loss) have entityId = null.
 */
export const openingBalances = pgTable("opening_balances", {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 50 }).notNull(),
    // Types: 'cash' | 'customer_due' | 'dsr_due' | 'sr_due' |
    //        'supplier_balance' | 'dsr_loan' | 'investment' | 'profit_loss'
    entityId: integer("entity_id"),         // customerId, dsrId, srId, brandId — null for global types
    entityName: varchar("entity_name", { length: 150 }), // Denormalized display name
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    balanceDate: date("balance_date").notNull(),
    note: text("note"),
    ...timestamps
}, (table) => ({
    typeIdx: index("idx_opening_balances_type").on(table.type),
    entityIdx: index("idx_opening_balances_entity").on(table.type, table.entityId),
    uniqueTypeEntity: uniqueIndex("idx_opening_balances_unique").on(table.type, table.entityId),
}));

export const openingBalancesRelations = relations(openingBalances, ({}) => ({}));
