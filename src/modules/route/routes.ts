import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createRouteSchema,
  updateRouteSchema,
  getRoutesQuerySchema,
} from "./validation";
import * as routeController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

app.post(
  "/",
  zValidator("json", createRouteSchema, (result, ctx) => {
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
  routeController.handleCreateRoute
);

app.get(
  "/",
  zValidator("query", getRoutesQuerySchema, (result, ctx) => {
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
  routeController.handleGetRoutes
);

app.get("/:id", routeController.handleGetRouteById);

// Update a route (Admin only)
app.put(
  "/:id",
  requireRole(["admin"]),
  zValidator("json", updateRouteSchema, (result, ctx) => {
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
  routeController.handleUpdateRoute
);

// Delete a route (Admin only)
app.delete("/:id", requireRole(["admin"]), routeController.handleDeleteRoute);

export default app;

