import { pgTable, text, numeric, integer, serial, varchar, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";

export const category = pgTable("category", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  ...timestamps
});


export const brand = pgTable("brand", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  ...timestamps
});

export const product = pgTable("product", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).unique().notNull(),
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

// Product variants for weight, volume, pack size
export const productVariant = pgTable("product_variant", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 50 }).unique(),                      // Unique SKU for inventory tracking
  variantType: varchar("variant_type", { length: 50 }).notNull(), // "weight", "volume", "pack"
  label: varchar("label", { length: 100 }).notNull(),              // "500g", "1L", "Pack of 6"
  value: numeric("value", { precision: 10, scale: 2 }),            // 500, 1, 6 (numeric value)
  unit: varchar("unit", { length: 20 }),                           // "g", "kg", "L", "ml", "pcs"
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  ...timestamps
});

export const stockBatch = pgTable("stock_batch", {
  id: serial("id").primaryKey(),
  variantId: integer("variant_id")
    .notNull()
    .references(() => productVariant.id, { onDelete: "cascade" }),
  supplierPrice: numeric("supplier_price", { precision: 10, scale: 2 }).notNull(),
  sellPrice: numeric("sell_price", { precision: 10, scale: 2 }).notNull(),
  initialQuantity: integer("initial_quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  initialFreeQty: integer("initial_free_qty").notNull().default(0),
  remainingFreeQty: integer("remaining_free_qty").notNull().default(0),
  ...timestamps
});

// Stock adjustments for return restocking, damage, manual adjustments
export const stockAdjustments = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => stockBatch.id, { onDelete: "set null" }),
  variantId: integer("variant_id")
    .notNull()
    .references(() => productVariant.id, { onDelete: "cascade" }),
  adjustmentType: varchar("adjustment_type", { length: 50 }).notNull(), // 'return_restock' | 'damage' | 'manual'
  quantity: integer("quantity").notNull(),         // +/- adjustment amount
  freeQuantity: integer("free_quantity").notNull().default(0),
  orderId: integer("order_id"),                    // Link to original order (optional)
  returnId: integer("return_id"),                  // Link to orderItemReturns (optional)
  note: text("note"),
  createdBy: integer("created_by"),                // User who made the adjustment
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
  variants: many(productVariant),
}));

export const productVariantRelations = relations(productVariant, ({ one, many }) => ({
  product: one(product, {
    fields: [productVariant.productId],
    references: [product.id],
  }),
  stockBatches: many(stockBatch),
  stockAdjustments: many(stockAdjustments),
}));

export const stockBatchRelations = relations(stockBatch, ({ one, many }) => ({
  variant: one(productVariant, {
    fields: [stockBatch.variantId],
    references: [productVariant.id],
  }),
  adjustments: many(stockAdjustments),
}));

export const stockAdjustmentsRelations = relations(stockAdjustments, ({ one }) => ({
  batch: one(stockBatch, {
    fields: [stockAdjustments.batchId],
    references: [stockBatch.id],
  }),
  variant: one(productVariant, {
    fields: [stockAdjustments.variantId],
    references: [productVariant.id],
  }),
}));

