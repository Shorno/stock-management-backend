import { pgTable, serial, decimal, text, date, integer, index, varchar, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";
import { brand } from "./product-schema";

// ==================== SUPPLIER PURCHASES ====================
// Records purchases/invoices from companies/brands (increases due)
// Now references brand instead of a separate suppliers table

export const supplierPurchases = pgTable("supplier_purchases", {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
        .notNull()
        .references(() => brand.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    purchaseDate: date("purchase_date").notNull(),
    description: text("description"),
    ...timestamps
}, (table) => ({
    brandIdx: index("idx_supplier_purchases_brand").on(table.brandId),
    dateIdx: index("idx_supplier_purchases_date").on(table.purchaseDate),
}));

// ==================== SUPPLIER PAYMENTS ====================
// Records payments made to companies/brands (decreases due)

export const supplierPayments = pgTable("supplier_payments", {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
        .notNull()
        .references(() => brand.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }),
    fromCashBalance: boolean("from_cash_balance").notNull().default(false),
    note: text("note"),
    ...timestamps
}, (table) => ({
    brandIdx: index("idx_supplier_payments_brand").on(table.brandId),
    dateIdx: index("idx_supplier_payments_date").on(table.paymentDate),
}));

// ==================== RELATIONS ====================

export const supplierPurchasesRelations = relations(supplierPurchases, ({ one }) => ({
    brand: one(brand, {
        fields: [supplierPurchases.brandId],
        references: [brand.id],
    }),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one }) => ({
    brand: one(brand, {
        fields: [supplierPayments.brandId],
        references: [brand.id],
    }),
}));
