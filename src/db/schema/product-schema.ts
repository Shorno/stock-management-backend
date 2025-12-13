import {pgTable, text, numeric, integer, serial, varchar} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {timestamps} from "../column.helpers.js";
import {user} from "./auth-schema.js";

export const category = pgTable("category", {
  id: serial("id").primaryKey(),
  name: varchar("name", {length: 100}).notNull(),
  slug: varchar("slug", {length: 100}).notNull().unique(),
  ...timestamps
});


export const brand = pgTable("brand", {
  id: serial("id").primaryKey(),
  name: varchar("name", {length: 100}).notNull(),
  slug: varchar("slug", {length: 100}).notNull().unique(),
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
  supplierPrice: numeric("supplier_price", { precision: 10, scale: 2 }).notNull(),
  sellPrice: numeric("sell_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps
});

export const categoryRelations = relations(category, ({ many }) => ({
  products: many(product),
}));

export const brandRelations = relations(brand, ({ many }) => ({
  products: many(product),
}));

export const productRelations = relations(product, ({ one }) => ({
  category: one(category, {
    fields: [product.categoryId],
    references: [category.id],
  }),
  brand: one(brand, {
    fields: [product.brandId],
    references: [brand.id],
  }),
  creator: one(user, {
    fields: [product.createdBy],
    references: [user.id],
  }),
}));

