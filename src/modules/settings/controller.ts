import type { Context } from "hono";
import type { UpdateSettingsInput } from "./validation";
import type { UserSettingsResponse } from "./types";
import * as settingsService from "./service";
import { logError } from "../../lib/error-handler";

type AppContext = Context<
    {
        Variables: {
            user: { id: string; email: string; role?: string } | null;
            session: any | null;
        };
    },
    any,
    {
        in: {
            json?: UpdateSettingsInput;
        };
        out: {
            json?: UpdateSettingsInput;
        };
    }
>;

/**
 * Get current user's settings
 */
export const handleGetSettings = async (c: AppContext): Promise<Response> => {
    try {
        const user = c.get("user");
        if (!user) {
            return c.json<UserSettingsResponse>(
                { success: false, message: "Unauthorized" },
                401
            );
        }

        const settings = await settingsService.getSettings(user.id);
        return c.json<UserSettingsResponse>({ success: true, data: settings });
    } catch (error) {
        logError("Error fetching settings:", error);
        return c.json<UserSettingsResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to fetch settings",
            },
            500
        );
    }
};

/**
 * Update current user's settings
 */
export const handleUpdateSettings = async (c: AppContext): Promise<Response> => {
    try {
        const user = c.get("user");
        if (!user) {
            return c.json<UserSettingsResponse>(
                { success: false, message: "Unauthorized" },
                401
            );
        }

        const validatedData = c.req.valid("json") as UpdateSettingsInput;
        const settings = await settingsService.updateSettings(user.id, validatedData);
        return c.json<UserSettingsResponse>({
            success: true,
            data: settings,
            message: "Settings updated successfully",
        });
    } catch (error) {
        logError("Error updating settings:", error);
        return c.json<UserSettingsResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update settings",
            },
            500
        );
    }
};

// ==================== ORDER EDIT PROTECTION ====================

interface ProtectionStatusResponse {
    success: boolean;
    data?: settingsService.OrderEditProtectionStatus;
    message?: string;
}

/**
 * Get order edit protection status (public - anyone can check)
 */
export const handleGetOrderEditProtection = async (c: Context): Promise<Response> => {
    try {
        const status = await settingsService.getOrderEditProtectionStatus();
        return c.json<ProtectionStatusResponse>({ success: true, data: status });
    } catch (error) {
        logError("Error fetching protection status:", error);
        return c.json<ProtectionStatusResponse>(
            { success: false, message: "Failed to fetch protection status" },
            500
        );
    }
};

/**
 * Verify order edit password
 */
export const handleVerifyOrderEditPassword = async (c: Context): Promise<Response> => {
    try {
        const body = await c.req.json<{ password: string }>();

        if (!body.password) {
            return c.json({ success: false, message: "Password is required" }, 400);
        }

        const isValid = await settingsService.verifyOrderEditPassword(body.password);

        if (isValid) {
            return c.json({ success: true, message: "Password verified" });
        } else {
            return c.json({ success: false, message: "Incorrect password" }, 401);
        }
    } catch (error) {
        logError("Error verifying password:", error);
        return c.json({ success: false, message: "Failed to verify password" }, 500);
    }
};

/**
 * Set order edit password (admin only)
 */
export const handleSetOrderEditPassword = async (c: AppContext): Promise<Response> => {
    try {
        const user = c.get("user");
        if (!user || user.role !== "admin") {
            return c.json({ success: false, message: "Admin access required" }, 403);
        }

        const body = await c.req.json<{ password: string }>();

        if (!body.password || body.password.length < 4) {
            return c.json({ success: false, message: "Password must be at least 4 characters" }, 400);
        }

        await settingsService.setOrderEditPassword(body.password);
        return c.json({ success: true, message: "Password set successfully" });
    } catch (error) {
        logError("Error setting password:", error);
        return c.json({ success: false, message: "Failed to set password" }, 500);
    }
};

/**
 * Remove order edit password (admin only)
 */
export const handleRemoveOrderEditPassword = async (c: AppContext): Promise<Response> => {
    try {
        const user = c.get("user");
        if (!user || user.role !== "admin") {
            return c.json({ success: false, message: "Admin access required" }, 403);
        }

        await settingsService.removeOrderEditPassword();
        return c.json({ success: true, message: "Password removed successfully" });
    } catch (error) {
        logError("Error removing password:", error);
        return c.json({ success: false, message: "Failed to remove password" }, 500);
    }
};

/**
 * Set order edit lock status (admin only)
 */
export const handleSetOrderEditLock = async (c: AppContext): Promise<Response> => {
    try {
        const user = c.get("user");
        if (!user || user.role !== "admin") {
            return c.json({ success: false, message: "Admin access required" }, 403);
        }

        const body = await c.req.json<{ locked: boolean }>();

        if (typeof body.locked !== "boolean") {
            return c.json({ success: false, message: "locked must be a boolean" }, 400);
        }

        await settingsService.setOrderEditLocked(body.locked);
        return c.json({ success: true, message: `Order editing ${body.locked ? "locked" : "unlocked"}` });
    } catch (error) {
        logError("Error setting lock status:", error);
        return c.json({ success: false, message: "Failed to set lock status" }, 500);
    }
};

/**
 * Set order edit lock mode (admin only)
 */
export const handleSetOrderEditLockMode = async (c: AppContext): Promise<Response> => {
    try {
        const user = c.get("user");
        if (!user || user.role !== "admin") {
            return c.json({ success: false, message: "Admin access required" }, 403);
        }

        const body = await c.req.json<{ mode: "always" | "once" }>();

        if (body.mode !== "always" && body.mode !== "once") {
            return c.json({ success: false, message: "mode must be 'always' or 'once'" }, 400);
        }

        await settingsService.setOrderEditLockMode(body.mode);
        return c.json({ success: true, message: `Lock mode set to '${body.mode}'` });
    } catch (error) {
        logError("Error setting lock mode:", error);
        return c.json({ success: false, message: "Failed to set lock mode" }, 500);
    }
};
