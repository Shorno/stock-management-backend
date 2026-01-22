import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createCategorySchema,
  updateCategorySchema,
  getCategoriesQuerySchema,
} from "./validation";
import * as categoryController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

app.post(
  "/",
  zValidator("json", createCategorySchema, (result, ctx) => {
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
  categoryController.handleCreateCategory
);

app.get(
  "/",
  zValidator("query", getCategoriesQuerySchema, (result, ctx) => {
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
  categoryController.handleGetCategories
);

app.get("/:id", categoryController.handleGetCategoryById);

// Update a category (Admin only)
app.put(
  "/:id",
  requireRole(["admin"]),
  zValidator("json", updateCategorySchema, (result, ctx) => {
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
  categoryController.handleUpdateCategory
);

// Delete a category (Admin only)
app.delete("/:id", requireRole(["admin"]), categoryController.handleDeleteCategory);

export default app;

