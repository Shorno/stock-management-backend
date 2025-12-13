import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createBrandSchema,
  updateBrandSchema,
  getBrandsQuerySchema,
} from "./validation.js";
import * as brandController from "./controller.js";

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

app.put(
  "/:id",
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

app.delete("/:id", brandController.handleDeleteBrand);

export default app;

