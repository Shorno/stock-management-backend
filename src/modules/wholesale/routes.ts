import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    createOrderSchema,
    updateOrderSchema,
    getOrdersQuerySchema,
    updateStatusSchema,
    partialCompleteSchema,
    recordPaymentSchema,
    getDueOrdersQuerySchema,
    saveAdjustmentSchema,
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

// Get due orders (unpaid/partial payment orders) - MUST be before /:id route
app.get(
    "/due-orders",
    zValidator("query", getDueOrdersQuerySchema),
    wholesaleController.handleGetDueOrders
);

// Get total due for a specific DSR - MUST be before /:id route
app.get("/dsr-due/:dsrId", wholesaleController.handleGetDsrTotalDue);

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

// Partial order completion (Admin and Manager only)
app.patch(
    "/:id/partial-complete",
    requireRole(["admin", "manager"]),
    zValidator("json", partialCompleteSchema, (result, ctx) => {
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
    wholesaleController.handlePartialComplete
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

// Record payment for an order
app.patch(
    "/:id/payment",
    requireRole(["admin", "manager"]),
    zValidator("json", recordPaymentSchema, (result, ctx) => {
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
    wholesaleController.handleRecordPayment
);

// Get payment history for an order
app.get("/:id/payments", wholesaleController.handleGetPaymentHistory);

// Get order adjustment data
app.get("/:id/adjustment", wholesaleController.handleGetOrderAdjustment);

// Save order adjustment (payments, expenses, item returns)
app.post(
    "/:id/adjustment",
    requireRole(["admin", "manager"]),
    zValidator("json", saveAdjustmentSchema, (result, ctx) => {
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
    wholesaleController.handleSaveOrderAdjustment
);

export default app;
