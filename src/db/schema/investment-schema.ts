import { pgTable, serial, text, timestamp, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Main investments table - tracks deposits
export const investments = pgTable("investments", {
    id: serial("id").primaryKey(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    investmentDate: text("investment_date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Investment withdrawals table - tracks withdrawals from investments
export const investmentWithdrawals = pgTable("investment_withdrawals", {
    id: serial("id").primaryKey(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    withdrawalDate: text("withdrawal_date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const investmentsRelations = relations(investments, ({ }) => ({}));
export const investmentWithdrawalsRelations = relations(investmentWithdrawals, ({ }) => ({}));
