import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createBrandSchema,
  updateBrandSchema,
  getBrandsQuerySchema,
} from "./validation";
import * as brandController from "./controller";
import * as brandService from "./service";
import { requireRole } from "../../lib/auth-middleware";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";
import { logError } from "../../lib/error-handler";
import { setActiveSchema } from "../../lib/visibility";

const app = new Hono();

app.post(
  "/",
  requireRole(["admin", "manager"]),
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

// Hide or show a company again (Admin only). Hidden companies, their products and
// their SRs are left out of pickers for new entries; history and reports keep them.
app.patch(
  "/:id/active",
  requireRole(["admin"]),
  zValidator("json", setActiveSchema, (result, ctx) => {
    if (!result.success) {
      return ctx.json({ success: false, message: result.error.issues[0]?.message ?? "Validation failed" }, 400);
    }
  }),
  async (c) => {
    try {
      const id = Number(c.req.param("id"));
      if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, message: "Invalid company ID" }, 400);
      const { isActive } = c.req.valid("json");
      const updated = await brandService.setBrandActive(id, isActive);
      if (!updated) return c.json({ success: false, message: "Company not found" }, 404);
      await auditLog({
        context: c, ...getUserInfoFromContext(c), action: "STATUS_CHANGE", entityType: "brand",
        entityId: id, entityName: updated.name, newValue: { isActive },
        metadata: { event: isActive ? "company_shown" : "company_hidden" },
      });
      return c.json({ success: true, data: updated, message: isActive ? "Company shown" : "Company hidden" });
    } catch (error) {
      logError("Error changing company visibility:", error);
      return c.json({ success: false, message: "Failed to update company" }, 500);
    }
  },
);

// Delete a brand (Admin only)
app.delete("/:id", requireRole(["admin"]), brandController.handleDeleteBrand);

export default app;

