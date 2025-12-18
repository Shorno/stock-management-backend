import { pgTable, serial, varchar, integer, decimal, text, date, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";
import { category, brand, product, stockBatch } from "./product-schema";

export const dsr = pgTable("dsr", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    ...timestamps
});

export const route = pgTable("route", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    ...timestamps
});

export const wholesaleOrders = pgTable("wholesale_orders", {
    id: serial("id").primaryKey(),
    orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
    dsrId: integer("dsr_id")
        .notNull()
        .references(() => dsr.id, { onDelete: "restrict" }),
    routeId: integer("route_id")
        .notNull()
        .references(() => route.id, { onDelete: "restrict" }),
    orderDate: date("order_date").notNull(),
    categoryId: integer("category_id")
        .references(() => category.id, { onDelete: "set null" }),
    brandId: integer("brand_id")
        .references(() => brand.id, { onDelete: "set null" }),
    invoiceNote: text("invoice_note"),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0"),
    total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    ...timestamps
}, (table) => ({
    dsrIdx: index("idx_wholesale_orders_dsr").on(table.dsrId),
    routeIdx: index("idx_wholesale_orders_route").on(table.routeId),
    dateIdx: index("idx_wholesale_orders_date").on(table.orderDate),
    statusIdx: index("idx_wholesale_orders_status").on(table.status),
    orderNumberIdx: index("idx_wholesale_orders_order_number").on(table.orderNumber),
}));

export const wholesaleOrderItems = pgTable("wholesale_order_items", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
        .notNull()
        .references(() => wholesaleOrders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
        .notNull()
        .references(() => product.id, { onDelete: "restrict" }),
    batchId: integer("batch_id")
        .notNull()
        .references(() => stockBatch.id, { onDelete: "restrict" }),
    brandId: integer("brand_id")
        .notNull()
        .references(() => brand.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    totalQuantity: integer("total_quantity").notNull(),
    availableQuantity: integer("available_quantity").notNull().default(0),
    freeQuantity: integer("free_quantity").notNull().default(0),
    salePrice: decimal("sale_price", { precision: 10, scale: 2 }).notNull(),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0"),
    net: decimal("net", { precision: 10, scale: 2 }).notNull(),
    ...timestamps
}, (table) => ({
    orderIdx: index("idx_wholesale_order_items_order").on(table.orderId),
    productIdx: index("idx_wholesale_order_items_product").on(table.productId),
    batchIdx: index("idx_wholesale_order_items_batch").on(table.batchId),
}));

// Relations
export const dsrRelations = relations(dsr, ({ many }) => ({
    wholesaleOrders: many(wholesaleOrders),
}));

export const routeRelations = relations(route, ({ many }) => ({
    wholesaleOrders: many(wholesaleOrders),
}));

export const wholesaleOrdersRelations = relations(wholesaleOrders, ({ one, many }) => ({
    dsr: one(dsr, {
        fields: [wholesaleOrders.dsrId],
        references: [dsr.id],
    }),
    route: one(route, {
        fields: [wholesaleOrders.routeId],
        references: [route.id],
    }),
    category: one(category, {
        fields: [wholesaleOrders.categoryId],
        references: [category.id],
    }),
    brand: one(brand, {
        fields: [wholesaleOrders.brandId],
        references: [brand.id],
    }),
    items: many(wholesaleOrderItems),
}));

export const wholesaleOrderItemsRelations = relations(wholesaleOrderItems, ({ one }) => ({
    order: one(wholesaleOrders, {
        fields: [wholesaleOrderItems.orderId],
        references: [wholesaleOrders.id],
    }),
    product: one(product, {
        fields: [wholesaleOrderItems.productId],
        references: [product.id],
    }),
    batch: one(stockBatch, {
        fields: [wholesaleOrderItems.batchId],
        references: [stockBatch.id],
    }),
    brand: one(brand, {
        fields: [wholesaleOrderItems.brandId],
        references: [brand.id],
    }),
}));