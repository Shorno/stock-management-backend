import { Hono } from "hono";
import { logError } from "../../lib/error-handler";
import { zValidator } from "@hono/zod-validator";
import * as billTypesService from "./service";
import { createBillTypeSchema, updateBillTypeSchema } from "./validation";

const billTypeRoutes = new Hono();

// Get all bill types
billTypeRoutes.get("/", async (c) => {
    try {
        const billTypes = await billTypesService.getBillTypes();
        return c.json({ success: true, data: billTypes });
    } catch (error) {
        logError("Error fetching bill types:", error);
        return c.json({ success: false, error: "Failed to fetch bill types" }, 500);
    }
});

// Create a new bill type
billTypeRoutes.post(
    "/",
    zValidator("json", createBillTypeSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const billType = await billTypesService.createBillType(input);
            return c.json({ success: true, data: billType, message: "Bill type created successfully" });
        } catch (error: any) {
            logError("Error creating bill type:", error);
            // Handle unique constraint violation
            if (error?.code === "23505") {
                return c.json({ success: false, error: "A bill type with this code already exists" }, 409);
            }
            return c.json({ success: false, error: "Failed to create bill type" }, 500);
        }
    }
);

// Update a bill type
billTypeRoutes.put(
    "/:id",
    zValidator("json", updateBillTypeSchema),
    async (c) => {
        try {
            const id = Number(c.req.param("id"));
            if (isNaN(id)) {
                return c.json({ success: false, error: "Invalid bill type ID" }, 400);
            }

            const input = c.req.valid("json");
            const updated = await billTypesService.updateBillType(id, input);
            if (!updated) {
                return c.json({ success: false, error: "Bill type not found" }, 404);
            }

            return c.json({ success: true, data: updated, message: "Bill type updated successfully" });
        } catch (error: any) {
            logError("Error updating bill type:", error);
            if (error?.code === "23505") {
                return c.json({ success: false, error: "A bill type with this code already exists" }, 409);
            }
            return c.json({ success: false, error: "Failed to update bill type" }, 500);
        }
    }
);

// Delete a bill type
billTypeRoutes.delete("/:id", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, error: "Invalid bill type ID" }, 400);
        }

        const deleted = await billTypesService.deleteBillType(id);
        if (!deleted) {
            return c.json({ success: false, error: "Bill type not found" }, 404);
        }

        return c.json({ success: true, message: "Bill type deleted successfully" });
    } catch (error: any) {
        logError("Error deleting bill type:", error);
        // Handle FK constraint - can't delete type that's in use
        if (error?.code === "23503") {
            return c.json({ success: false, error: "Cannot delete bill type that is in use by existing bills" }, 409);
        }
        return c.json({ success: false, error: "Failed to delete bill type" }, 500);
    }
});

export { billTypeRoutes };
