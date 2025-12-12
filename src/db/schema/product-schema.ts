import { pgTable, text, numeric, integer } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import {timestamps} from "../column.helpers.js";

export const product = pgTable("product", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  brand: text("brand").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps

});

