import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getLogsQuerySchema } from "./validation";
import * as auditLogController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

// Get all audit logs (Admin and Manager only)
app.get(
    "/",
    requireRole(["admin", "manager"]),
    zValidator("query", getLogsQuerySchema, (result, ctx) => {
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
    auditLogController.handleGetLogs
);

// Get audit log by ID (Admin and Manager only)
app.get("/:id", requireRole(["admin", "manager"]), auditLogController.handleGetLogById);

export default app;
