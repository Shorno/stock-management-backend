import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { updateSettingsSchema } from "./validation";
import * as settingsController from "./controller";

const app = new Hono();

// Get current user's settings
app.get("/", settingsController.handleGetSettings);

// Update current user's settings
app.patch(
    "/",
    zValidator("json", updateSettingsSchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json(
                {
                    success: false,
                    message: "Validation failed",
                    errors: result.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                },
                400
            );
        }
    }),
    settingsController.handleUpdateSettings
);

export default app;
