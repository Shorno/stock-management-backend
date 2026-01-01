import { pgTable, serial, varchar, integer, boolean, index } from "drizzle-orm/pg-core";
import { timestamps } from "../column.helpers";

export const unit = pgTable("unit", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
    abbreviation: varchar("abbreviation", { length: 20 }).notNull().unique(),
    multiplier: integer("multiplier").notNull().default(1),
    isBase: boolean("is_base").notNull().default(false),
    ...timestamps
}, (table) => ({
    abbreviationIdx: index("idx_unit_abbreviation").on(table.abbreviation),
}));
