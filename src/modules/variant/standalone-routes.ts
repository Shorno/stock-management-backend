import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { updateVariantSchema } from "./validation";
import * as variantController from "./controller";

// Standalone variant routes for /variants/:id operations
const app = new Hono();

app.get("/:id", variantController.handleGetVariantById);

app.put(
    "/:id",
    zValidator("json", updateVariantSchema, (result, ctx) => {
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
    variantController.handleUpdateVariant
);

app.delete("/:id", variantController.handleDeleteVariant);

export default app;
