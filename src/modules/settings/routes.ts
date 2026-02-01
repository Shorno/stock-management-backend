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

// ==================== ORDER EDIT PROTECTION ====================

// Get order edit protection status (public)
app.get("/order-edit-protection", settingsController.handleGetOrderEditProtection);

// Verify order edit password
app.post("/order-edit-protection/verify", settingsController.handleVerifyOrderEditPassword);

// Set order edit password (admin only)
app.post("/order-edit-protection/password", settingsController.handleSetOrderEditPassword);

// Remove order edit password (admin only)
app.delete("/order-edit-protection/password", settingsController.handleRemoveOrderEditPassword);

// Set lock status (admin only)
app.patch("/order-edit-protection/lock", settingsController.handleSetOrderEditLock);

// Set lock mode (admin only)
app.patch("/order-edit-protection/lock-mode", settingsController.handleSetOrderEditLockMode);

export default app;
