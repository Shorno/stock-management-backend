import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    createVariantSchema,
    getVariantsQuerySchema,
} from "./validation";
import * as variantController from "./controller";

const app = new Hono();

// Routes for /products/:productId/variants
app.post(
    "/",
    zValidator("json", createVariantSchema, (result, ctx) => {
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
    variantController.handleCreateVariant
);

app.get(
    "/",
    zValidator("query", getVariantsQuerySchema, (result, ctx) => {
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
    variantController.handleGetVariants
);

export default app;
