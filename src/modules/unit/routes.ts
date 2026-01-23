import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    createUnitSchema,
    updateUnitSchema,
    getUnitsQuerySchema,
} from "./validation";
import * as unitController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

app.post(
    "/",
    zValidator("json", createUnitSchema, (result, ctx) => {
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
    unitController.handleCreateUnit
);

app.get(
    "/",
    zValidator("query", getUnitsQuerySchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json(
                {
                    success: false,
                    message: "Invalid query parameters",
                    errors: result.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                },
                400
            );
        }
    }),
    unitController.handleGetUnits
);

app.get("/:id", unitController.handleGetUnitById);

// Update a unit (Admin only)
app.put(
    "/:id",
    requireRole(["admin"]),
    zValidator("json", updateUnitSchema, (result, ctx) => {
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
    unitController.handleUpdateUnit
);

// Delete a unit (Admin only)
app.delete("/:id", requireRole(["admin"]), unitController.handleDeleteUnit);

export default app;
