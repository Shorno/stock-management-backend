import { pgTable, serial, text, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const plAdjustments = pgTable("pl_adjustments", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    type: text("type").notNull(), // "income" | "expense"
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    note: text("note"),
    adjustmentDate: text("adjustment_date").notNull(),
    // Income adds to net assets and expense subtracts from them. Adjustments recorded
    // before this rule existed were migrated as false and stay profit-only.
    affectsNetAssets: boolean("affects_net_assets").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const plAdjustmentsRelations = relations(plAdjustments, ({ }) => ({}));
