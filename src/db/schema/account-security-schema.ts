import { pgTable, serial, text, integer, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { timestamps } from "../column.helpers";
import { user } from "./auth-schema";

/**
 * A user's verified mobile number (8801XXXXXXXXX). A row exists only after the
 * number was confirmed with an SMS code. One number belongs to one account.
 * Password changes are allowed only for users who have a row here.
 */
export const userPhone = pgTable("user_phone", {
    userId: text("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 20 }).notNull().unique(),
    verifiedAt: timestamp("verified_at").notNull(),
    ...timestamps,
});

/**
 * One-time SMS codes. Only an HMAC of the code is stored.
 * purpose: verify_phone | change_password
 * A code is spent (consumed_at set) when used, replaced, or after too many wrong tries.
 */
export const phoneOtp = pgTable("phone_otp", {
    id: serial("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 30 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    userPurposeIdx: index("idx_phone_otp_user_purpose").on(table.userId, table.purpose, table.createdAt),
}));

export type UserPhone = typeof userPhone.$inferSelect;
export type PhoneOtp = typeof phoneOtp.$inferSelect;
