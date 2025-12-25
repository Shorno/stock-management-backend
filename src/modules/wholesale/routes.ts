import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    createOrderSchema,
    updateOrderSchema,
    getOrdersQuerySchema,
    updateStatusSchema,
} from "./validation";
import * as wholesaleController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

// Create wholesale order
app.post(
    "/",
    zValidator("json", createOrderSchema, (result, ctx) => {
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
    wholesaleController.handleCreateOrder
);

// Get all wholesale orders
app.get(
    "/",
    zValidator("query", getOrdersQuerySchema, (result, ctx) => {
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
    wholesaleController.handleGetOrders
);

// Get wholesale order by ID
app.get("/:id", wholesaleController.handleGetOrderById);

// Update order status (Admin and Manager only)
app.patch(
    "/:id/status",
    requireRole(["admin", "manager"]),
    zValidator("json", updateStatusSchema, (result, ctx) => {
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
    wholesaleController.handleUpdateStatus
);

// Generate invoice PDF
app.get("/:id/invoice-pdf", wholesaleController.handleGenerateInvoicePdf);

// Update wholesale order
app.put(
    "/:id",
    zValidator("json", updateOrderSchema, (result, ctx) => {
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
    wholesaleController.handleUpdateOrder
);

// Delete wholesale order
app.delete("/:id", wholesaleController.handleDeleteOrder);

export default app;

