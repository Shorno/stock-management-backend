import { pgTable, text, numeric, integer, serial, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";

export const category = pgTable("category", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ...timestamps
});


export const brand = pgTable("brand", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ...timestamps
});

export const product = pgTable("product", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => category.id, { onDelete: "cascade" }),
  brandId: integer("brand_id")
    .notNull()
    .references(() => brand.id, { onDelete: "cascade" }),
  lowStockThreshold: integer("low_stock_threshold").default(10),
  ...timestamps
});

export const stockBatch = pgTable("stock_batch", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  supplierPrice: numeric("supplier_price", { precision: 10, scale: 2 }).notNull(),
  sellPrice: numeric("sell_price", { precision: 10, scale: 2 }).notNull(),
  initialQuantity: integer("initial_quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  initialFreeQty: integer("initial_free_qty").notNull().default(0),
  remainingFreeQty: integer("remaining_free_qty").notNull().default(0),
  ...timestamps
});

export const categoryRelations = relations(category, ({ many }) => ({
  products: many(product),
}));

export const brandRelations = relations(brand, ({ many }) => ({
  products: many(product),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  category: one(category, {
    fields: [product.categoryId],
    references: [category.id],
  }),
  brand: one(brand, {
    fields: [product.brandId],
    references: [brand.id],
  }),
  stockBatches: many(stockBatch),
}));

export const stockBatchRelations = relations(stockBatch, ({ one }) => ({
  product: one(product, {
    fields: [stockBatch.productId],
    references: [product.id],
  }),
}));
