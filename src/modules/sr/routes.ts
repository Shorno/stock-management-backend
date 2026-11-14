import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createSrSchema,
  updateSrSchema,
  getSrsQuerySchema,
  srOrderItemsQuerySchema,
} from "./validation";
import * as srController from "./controller";
import * as srService from "./service";
import { requireRole } from "../../lib/auth-middleware";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";
import { logError } from "../../lib/error-handler";
import { setActiveSchema } from "../../lib/visibility";

const app = new Hono();

app.post(
  "/",
  requireRole(["admin", "manager"]),
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

// SR stats route
app.get("/:id/stats", srController.handleGetSrStats);

// SR order items route (paginated)
app.get(
  "/:id/order-items",
  zValidator("query", srOrderItemsQuerySchema, (result, ctx) => {
    if (!result.success) {
      return ctx.json({ success: false, message: "Invalid query parameters" }, 400);
    }
  }),
  srController.handleGetSrOrderItems
);

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

// Hide or show an SR again (Admin only). Hidden SRs are left out of pickers for new
// entries; their orders, dues, commissions and reports are unchanged.
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
      if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, message: "Invalid SR ID" }, 400);
      const { isActive } = c.req.valid("json");
      const updated = await srService.setSrActive(id, isActive);
      if (!updated) return c.json({ success: false, message: "SR not found" }, 404);
      await auditLog({
        context: c, ...getUserInfoFromContext(c), action: "STATUS_CHANGE", entityType: "sr",
        entityId: id, entityName: updated.name, newValue: { isActive },
        metadata: { event: isActive ? "sr_shown" : "sr_hidden" },
      });
      return c.json({ success: true, data: updated, message: isActive ? "SR shown" : "SR hidden" });
    } catch (error) {
      logError("Error changing SR visibility:", error);
      return c.json({ success: false, message: "Failed to update SR" }, 500);
    }
  },
);

// Delete an SR (Admin only)
app.delete("/:id", requireRole(["admin"]), srController.handleDeleteSr);

export default app;
