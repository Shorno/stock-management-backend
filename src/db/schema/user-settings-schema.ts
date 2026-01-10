import { pgTable, serial, text, integer, boolean, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";
import { user } from "./auth-schema";

/**
 * User Settings table - stores user-specific preferences
 */
export const userSettings = pgTable("user_settings", {
    id: serial("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .unique()
        .references(() => user.id, { onDelete: "cascade" }),
    // Pending order alert configuration
    pendingOrderAlertDays: integer("pending_order_alert_days").notNull().default(3),
    enablePendingOrderAlerts: boolean("enable_pending_order_alerts").notNull().default(true),
    ...timestamps
}, (table) => ({
    userIdx: index("idx_user_settings_user").on(table.userId),
}));

// User settings relations
export const userSettingsRelations = relations(userSettings, ({ one }) => ({
    user: one(user, {
        fields: [userSettings.userId],
        references: [user.id],
    }),
}));
