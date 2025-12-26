import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    createStockBatchSchema,
    updateStockBatchSchema,
    getStockBatchesQuerySchema,
} from "./validation";
import * as stockBatchController from "./controller";

// Routes for variant-scoped batches: /api/variants/:variantId/batches
export const variantBatchRoutes = new Hono();

variantBatchRoutes.post(
    "/",
    zValidator("json", createStockBatchSchema, (result, ctx) => {
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
    stockBatchController.handleCreateStockBatch
);

variantBatchRoutes.get(
    "/",
    zValidator("query", getStockBatchesQuerySchema, (result, ctx) => {
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
    stockBatchController.handleGetStockBatches
);

// Routes for direct batch operations: /api/stock-batches/:id
export const stockBatchRoutes = new Hono();

stockBatchRoutes.get("/:id", stockBatchController.handleGetStockBatchById);

stockBatchRoutes.patch(
    "/:id",
    zValidator("json", updateStockBatchSchema, (result, ctx) => {
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
    stockBatchController.handleUpdateStockBatch
);

stockBatchRoutes.delete("/:id", stockBatchController.handleDeleteStockBatch);
