import { Hono } from "hono";
import { logError } from "../../lib/error-handler";
import { zValidator } from "@hono/zod-validator";
import * as plAdjustmentsService from "./service";
import { createPlAdjustmentSchema, getPlAdjustmentsQuerySchema } from "./validation";
import { requireRole } from "../../lib/auth-middleware";

const plAdjustmentRoutes = new Hono();

// Get all P&L adjustments
plAdjustmentRoutes.get(
    "/",
    zValidator("query", getPlAdjustmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const adjustments = await plAdjustmentsService.getPlAdjustments(query);
            return c.json({ success: true, data: adjustments });
        } catch (error) {
            logError("Error fetching P&L adjustments:", error);
            return c.json({ success: false, error: "Failed to fetch P&L adjustments" }, 500);
        }
    }
);

// Get P&L adjustments summary
plAdjustmentRoutes.get(
    "/summary",
    zValidator("query", getPlAdjustmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const summary = await plAdjustmentsService.getPlAdjustmentsSummary(query);
            return c.json({ success: true, data: summary });
        } catch (error) {
            logError("Error fetching P&L adjustments summary:", error);
            return c.json({ success: false, error: "Failed to fetch summary" }, 500);
        }
    }
);

// Create a new P&L adjustment
plAdjustmentRoutes.post(
    "/",
    zValidator("json", createPlAdjustmentSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const adjustment = await plAdjustmentsService.createPlAdjustment(input);
            return c.json({ success: true, data: adjustment, message: "P&L adjustment created successfully" });
        } catch (error) {
            logError("Error creating P&L adjustment:", error);
            return c.json({ success: false, error: "Failed to create P&L adjustment" }, 500);
        }
    }
);

// Delete a P&L adjustment (Admin only)
plAdjustmentRoutes.delete("/:id", requireRole(["admin", "super_admin"]), async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, error: "Invalid adjustment ID" }, 400);
        }

        const deleted = await plAdjustmentsService.deletePlAdjustment(id);
        if (!deleted) {
            return c.json({ success: false, error: "Adjustment not found" }, 404);
        }

        return c.json({ success: true, message: "P&L adjustment deleted successfully" });
    } catch (error) {
        logError("Error deleting P&L adjustment:", error);
        return c.json({ success: false, error: "Failed to delete P&L adjustment" }, 500);
    }
});

export { plAdjustmentRoutes };
