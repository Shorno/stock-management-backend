import { pgTable, serial, varchar, decimal, text, date, integer, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";

// ==================== SUPPLIERS ====================

export const suppliers = pgTable("suppliers", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    ...timestamps
}, (table) => ({
    nameIdx: index("idx_suppliers_name").on(table.name),
}));

// ==================== SUPPLIER PURCHASES ====================
// Records purchases/invoices from suppliers (increases due)

export const supplierPurchases = pgTable("supplier_purchases", {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
        .notNull()
        .references(() => suppliers.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    purchaseDate: date("purchase_date").notNull(),
    description: text("description"),
    ...timestamps
}, (table) => ({
    supplierIdx: index("idx_supplier_purchases_supplier").on(table.supplierId),
    dateIdx: index("idx_supplier_purchases_date").on(table.purchaseDate),
}));

// ==================== SUPPLIER PAYMENTS ====================
// Records payments made to suppliers (decreases due)

export const supplierPayments = pgTable("supplier_payments", {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
        .notNull()
        .references(() => suppliers.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }),
    note: text("note"),
    ...timestamps
}, (table) => ({
    supplierIdx: index("idx_supplier_payments_supplier").on(table.supplierId),
    dateIdx: index("idx_supplier_payments_date").on(table.paymentDate),
}));

// ==================== RELATIONS ====================

export const suppliersRelations = relations(suppliers, ({ many }) => ({
    purchases: many(supplierPurchases),
    payments: many(supplierPayments),
}));

export const supplierPurchasesRelations = relations(supplierPurchases, ({ one }) => ({
    supplier: one(suppliers, {
        fields: [supplierPurchases.supplierId],
        references: [suppliers.id],
    }),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one }) => ({
    supplier: one(suppliers, {
        fields: [supplierPayments.supplierId],
        references: [suppliers.id],
    }),
}));
