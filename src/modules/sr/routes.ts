import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createSrSchema,
  updateSrSchema,
  getSrsQuerySchema,
} from "./validation";
import * as srController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

app.post(
  "/",
  zValidator("json", createSrSchema, (result, ctx) => {
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
  srController.handleCreateSr
);

app.get(
  "/",
  zValidator("query", getSrsQuerySchema, (result, ctx) => {
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
  srController.handleGetSrs
);

app.get("/:id", srController.handleGetSrById);

// Update an SR (Admin only)
app.put(
  "/:id",
  requireRole(["admin"]),
  zValidator("json", updateSrSchema, (result, ctx) => {
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
  srController.handleUpdateSr
);

// Delete an SR (Admin only)
app.delete("/:id", requireRole(["admin"]), srController.handleDeleteSr);

export default app;
