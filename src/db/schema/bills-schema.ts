import { pgTable, serial, text, timestamp, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const bills = pgTable("bills", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    note: text("note"),
    billDate: text("bill_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const billsRelations = relations(bills, ({ }) => ({}));
