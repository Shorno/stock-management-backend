import { pgTable, serial, text, timestamp, decimal, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billTypes } from "./bill-types-schema";

export const bills = pgTable("bills", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    note: text("note"),
    billDate: text("bill_date").notNull(),
    billTypeId: integer("bill_type_id").notNull().references(() => billTypes.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const billsRelations = relations(bills, ({ one }) => ({
    billType: one(billTypes, {
        fields: [bills.billTypeId],
        references: [billTypes.id],
    }),
}));
