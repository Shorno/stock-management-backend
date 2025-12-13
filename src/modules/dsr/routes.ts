import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createDsrSchema,
  updateDsrSchema,
  getDsrsQuerySchema,
} from "./validation";
import * as dsrController from "./controller";

const app = new Hono();

app.post(
  "/",
  zValidator("json", createDsrSchema, (result, ctx) => {
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
  dsrController.handleCreateDsr
);

app.get(
  "/",
  zValidator("query", getDsrsQuerySchema, (result, ctx) => {
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
  dsrController.handleGetDsrs
);

app.get("/:id", dsrController.handleGetDsrById);

app.put(
  "/:id",
  zValidator("json", updateDsrSchema, (result, ctx) => {
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
  dsrController.handleUpdateDsr
);

app.delete("/:id", dsrController.handleDeleteDsr);

export default app;

