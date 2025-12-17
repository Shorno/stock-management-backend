import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
} from "./validation";
import * as productController from "./controller";

const app = new Hono();

app.post(
  "/",
  zValidator("json", createProductSchema, (result, ctx) => {
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
  productController.handleCreateProduct
);

app.get(
  "/",
  zValidator("query", getProductsQuerySchema, (result, ctx) => {
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
  productController.handleGetProducts
);

app.get("/:id", productController.handleGetProductById);

// Update a product
app.patch(
  "/:id",
  zValidator("json", updateProductSchema, (result, ctx) => {
    console.log("=== VALIDATION MIDDLEWARE ===");
    console.log("Validation result:", result.success ? "SUCCESS" : "FAILED");

    if (!result.success) {
      console.log("Validation errors:", JSON.stringify(result.error.issues, null, 2));
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

    console.log("Validated data:", JSON.stringify(result.data, null, 2));
    console.log("=== END VALIDATION MIDDLEWARE ===");
  }),
  productController.handleUpdateProduct
);

app.delete("/:id", productController.handleDeleteProduct);

export default app;
