import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createCategorySchema,
  updateCategorySchema,
  getCategoriesQuerySchema,
} from "./validation.js";
import * as categoryController from "./controller.js";

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

app.put(
  "/:id",
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

app.delete("/:id", categoryController.handleDeleteCategory);

export default app;

