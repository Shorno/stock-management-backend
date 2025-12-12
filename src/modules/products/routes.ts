import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
} from "./validation.js";
import * as productController from "./controller.js";

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
  productController.handleUpdateProduct
);

app.delete("/:id", productController.handleDeleteProduct);

app.patch("/:id/quantity", productController.handleUpdateQuantity);

export default app;

