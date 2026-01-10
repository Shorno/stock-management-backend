import type { Context } from "hono";
import type { UpdateSettingsInput } from "./validation";
import type { UserSettingsResponse } from "./types";
import * as settingsService from "./service";

type AppContext = Context<
    {
        Variables: {
            user: { id: string; email: string } | null;
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
        console.error("Error fetching settings:", error);
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
        console.error("Error updating settings:", error);
        return c.json<UserSettingsResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update settings",
            },
            500
        );
    }
};
