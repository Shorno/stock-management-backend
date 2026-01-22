import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createBrandSchema,
  updateBrandSchema,
  getBrandsQuerySchema,
} from "./validation";
import * as brandController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

app.post(
  "/",
  zValidator("json", createBrandSchema, (result, ctx) => {
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
  brandController.handleCreateBrand
);

app.get(
  "/",
  zValidator("query", getBrandsQuerySchema, (result, ctx) => {
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
  brandController.handleGetBrands
);

app.get("/:id", brandController.handleGetBrandById);

// Update a brand (Admin only)
app.put(
  "/:id",
  requireRole(["admin"]),
  zValidator("json", updateBrandSchema, (result, ctx) => {
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
  brandController.handleUpdateBrand
);

// Delete a brand (Admin only)
app.delete("/:id", requireRole(["admin"]), brandController.handleDeleteBrand);

export default app;

