import { pgTable, serial, text, timestamp, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const plAdjustments = pgTable("pl_adjustments", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    type: text("type").notNull(), // "income" | "expense"
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    note: text("note"),
    adjustmentDate: text("adjustment_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const plAdjustmentsRelations = relations(plAdjustments, ({ }) => ({}));
