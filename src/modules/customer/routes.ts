import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    createCustomerSchema,
    updateCustomerSchema,
    getCustomersQuerySchema,
} from "./validation";
import * as customerService from "./service";
import { logError } from "../../lib/error-handler";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

// Get all customers
app.get(
    "/",
    zValidator("query", getCustomersQuerySchema),
    async (ctx) => {
        try {
            const query = ctx.req.valid("query");
            const { customers, total } = await customerService.getCustomers(query);

            return ctx.json({
                success: true,
                data: customers,
                total,
            });
        } catch (error) {
            logError("Error fetching customers:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch customers",
                },
                500
            );
        }
    }
);

// Get customer by ID
app.get("/:id", async (ctx) => {
    try {
        const id = parseInt(ctx.req.param("id"));
        if (isNaN(id)) {
            return ctx.json({ success: false, message: "Invalid ID" }, 400);
        }

        const customer = await customerService.getCustomerById(id);
        if (!customer) {
            return ctx.json({ success: false, message: "Customer not found" }, 404);
        }

        return ctx.json({ success: true, data: customer });
    } catch (error) {
        logError("Error fetching customer:", error);
        return ctx.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to fetch customer",
            },
            500
        );
    }
});

// Create customer
app.post(
    "/",
    zValidator("json", createCustomerSchema, (result, ctx) => {
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
    async (ctx) => {
        try {
            const data = ctx.req.valid("json");
            const customer = await customerService.createCustomer(data);

            return ctx.json(
                {
                    success: true,
                    message: "Customer created successfully",
                    data: customer,
                },
                201
            );
        } catch (error) {
            logError("Error creating customer:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to create customer",
                },
                500
            );
        }
    }
);

// Update customer (Admin only)
app.put(
    "/:id",
    requireRole(["admin"]),
    zValidator("json", updateCustomerSchema, (result, ctx) => {
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
    async (ctx) => {
        try {
            const id = parseInt(ctx.req.param("id"));
            if (isNaN(id)) {
                return ctx.json({ success: false, message: "Invalid ID" }, 400);
            }

            const data = ctx.req.valid("json");
            const customer = await customerService.updateCustomer(id, data);

            if (!customer) {
                return ctx.json({ success: false, message: "Customer not found" }, 404);
            }

            return ctx.json({
                success: true,
                message: "Customer updated successfully",
                data: customer,
            });
        } catch (error) {
            logError("Error updating customer:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to update customer",
                },
                500
            );
        }
    }
);

// Delete customer (Admin only)
app.delete("/:id", requireRole(["admin"]), async (ctx) => {
    try {
        const id = parseInt(ctx.req.param("id"));
        if (isNaN(id)) {
            return ctx.json({ success: false, message: "Invalid ID" }, 400);
        }

        const deleted = await customerService.deleteCustomer(id);
        if (!deleted) {
            return ctx.json({ success: false, message: "Customer not found" }, 404);
        }

        return ctx.json({
            success: true,
            message: "Customer deleted successfully",
        });
    } catch (error) {
        logError("Error deleting customer:", error);
        return ctx.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to delete customer",
            },
            500
        );
    }
});

export default app;
