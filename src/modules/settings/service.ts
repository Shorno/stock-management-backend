import { db } from "../../db/config";
import { userSettings, globalSettings, type GlobalSettings } from "../../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
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

// ==================== GLOBAL SETTINGS ====================

/**
 * Get global settings. Creates default if not found (singleton pattern).
 */
export const getGlobalSettings = async (): Promise<GlobalSettings> => {
    const existing = await db.query.globalSettings.findFirst();

    if (existing) {
        return existing;
    }

    // Create default global settings
    const [created] = await db.insert(globalSettings).values({
        orderEditLockMode: "always",
        orderEditLocked: false,
    }).returning();

    if (!created) {
        throw new Error("Failed to create global settings");
    }
    return created;
};

/**
 * Set or update order edit password (admin only)
 */
export const setOrderEditPassword = async (password: string): Promise<void> => {
    const settings = await getGlobalSettings();

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await db
        .update(globalSettings)
        .set({
            orderEditPassword: hashedPassword,
            orderEditLocked: true, // Auto-lock when password is set
        })
        .where(eq(globalSettings.id, settings.id));
};

/**
 * Remove order edit password (disable protection)
 */
export const removeOrderEditPassword = async (): Promise<void> => {
    const settings = await getGlobalSettings();

    await db
        .update(globalSettings)
        .set({
            orderEditPassword: null,
            orderEditLocked: false,
        })
        .where(eq(globalSettings.id, settings.id));
};

/**
 * Verify order edit password
 */
export const verifyOrderEditPassword = async (password: string): Promise<boolean> => {
    const settings = await getGlobalSettings();

    if (!settings.orderEditPassword) {
        // No password set, allow access
        return true;
    }

    return bcrypt.compare(password, settings.orderEditPassword);
};

/**
 * Toggle order edit lock status
 */
export const setOrderEditLocked = async (locked: boolean): Promise<void> => {
    const settings = await getGlobalSettings();

    await db
        .update(globalSettings)
        .set({ orderEditLocked: locked })
        .where(eq(globalSettings.id, settings.id));
};

/**
 * Set order edit lock mode
 */
export const setOrderEditLockMode = async (mode: "always" | "once"): Promise<void> => {
    const settings = await getGlobalSettings();

    await db
        .update(globalSettings)
        .set({ orderEditLockMode: mode })
        .where(eq(globalSettings.id, settings.id));
};

/**
 * Get order edit protection status
 */
export interface OrderEditProtectionStatus {
    hasPassword: boolean;
    isLocked: boolean;
    lockMode: "always" | "once";
}

export const getOrderEditProtectionStatus = async (): Promise<OrderEditProtectionStatus> => {
    const settings = await getGlobalSettings();

    return {
        hasPassword: !!settings.orderEditPassword,
        isLocked: settings.orderEditLocked,
        lockMode: settings.orderEditLockMode,
    };
};
