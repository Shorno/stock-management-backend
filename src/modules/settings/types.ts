import type { userSettings } from "../../db/schema";

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;

export interface UserSettingsResponse {
    success: boolean;
    data?: UserSettings;
    message?: string;
}
