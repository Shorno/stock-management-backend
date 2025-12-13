import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createRouteSchema,
  updateRouteSchema,
  getRoutesQuerySchema,
} from "./validation.js";
import * as routeController from "./controller.js";

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

app.put(
  "/:id",
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

app.delete("/:id", routeController.handleDeleteRoute);

export default app;

