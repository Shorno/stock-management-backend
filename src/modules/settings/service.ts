import { db } from "../../db/config";
import { userSettings } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { UserSettings, NewUserSettings } from "./types";
import type { UpdateSettingsInput } from "./validation";

/**
 * Get user settings by user ID. Creates default settings if not found.
 */
export const getSettings = async (userId: string): Promise<UserSettings> => {
    // Try to find existing settings
    const existing = await db.query.userSettings.findFirst({
        where: (settings, { eq }) => eq(settings.userId, userId),
    });

    if (existing) {
        return existing;
    }

    // Create default settings for user
    const newSettings: NewUserSettings = {
        userId,
        pendingOrderAlertDays: 3,
        enablePendingOrderAlerts: true,
    };

    const [created] = await db.insert(userSettings).values(newSettings).returning();
    if (!created) {
        throw new Error("Failed to create user settings");
    }
    return created;
};

/**
 * Update user settings
 */
export const updateSettings = async (
    userId: string,
    data: UpdateSettingsInput
): Promise<UserSettings> => {
    // First ensure settings exist
    await getSettings(userId);

    // Update the settings
    const [updated] = await db
        .update(userSettings)
        .set({
            ...(data.pendingOrderAlertDays !== undefined && { pendingOrderAlertDays: data.pendingOrderAlertDays }),
            ...(data.enablePendingOrderAlerts !== undefined && { enablePendingOrderAlerts: data.enablePendingOrderAlerts }),
        })
        .where(eq(userSettings.userId, userId))
        .returning();

    if (!updated) {
        throw new Error("Failed to update user settings");
    }
    return updated;
};
