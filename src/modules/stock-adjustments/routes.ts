import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as stockAdjustmentService from "./service";
import {
    createStockAdjustmentSchema,
    getStockAdjustmentsQuerySchema,
    getBatchesQuerySchema,
} from "./validation";

const stockAdjustmentRoutes = new Hono();

// Create a new stock adjustment
stockAdjustmentRoutes.post(
    "/",
    zValidator("json", createStockAdjustmentSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            // TODO: Get createdBy from auth context
            const result = await stockAdjustmentService.createStockAdjustment(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            return c.json({ success: true, data: result });
        } catch (error) {
            console.error("Error creating stock adjustment:", error);
            return c.json({ success: false, error: "Failed to create stock adjustment" }, 500);
        }
    }
);

// Get stock adjustments with filters
stockAdjustmentRoutes.get(
    "/",
    zValidator("query", getStockAdjustmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const adjustments = await stockAdjustmentService.getStockAdjustments(query);
            return c.json({ success: true, data: adjustments });
        } catch (error) {
            console.error("Error fetching stock adjustments:", error);
            return c.json({ success: false, error: "Failed to fetch stock adjustments" }, 500);
        }
    }
);

// Get batches for a variant (for restock batch selection)
stockAdjustmentRoutes.get(
    "/batches",
    zValidator("query", getBatchesQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const batches = await stockAdjustmentService.getBatchesForVariant(query);
            return c.json({ success: true, data: batches });
        } catch (error) {
            console.error("Error fetching batches:", error);
            return c.json({ success: false, error: "Failed to fetch batches" }, 500);
        }
    }
);

export { stockAdjustmentRoutes };
