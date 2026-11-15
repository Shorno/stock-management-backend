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
import { updateSrProfileSchema, createSrDocumentSchema, mergeSrsSchema } from "./validation";
import { mergeSrs } from "./merge";

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

// ==================== Profile & documents (Admin only) ====================

const firstIssue = (result: any, ctx: any) => {
  if (!result.success) {
    return ctx.json({
      success: false,
      message: result.error.issues[0]?.message ?? "Validation failed",
      errors: result.error.issues.map((issue: any) => ({ path: issue.path.join("."), message: issue.message })),
    }, 400);
  }
};

const parseId = (raw: string | undefined) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// Update phone, address, NID, emergency contact, notes or photo. Sent fields only; "" or null clears.
app.patch(
  "/:id/profile",
  requireRole(["admin"]),
  zValidator("json", updateSrProfileSchema, firstIssue),
  async (c) => {
    try {
      const id = parseId(c.req.param("id"));
      if (!id) return c.json({ success: false, message: "Invalid SR ID" }, 400);
      const before = await srService.getSrById(id);
      if (!before) return c.json({ success: false, message: "SR not found" }, 404);
      const changes = c.req.valid("json");
      const updated = await srService.updateSrProfile(id, changes);
      if (!updated) return c.json({ success: false, message: "SR not found" }, 404);
      const changed = Object.keys(changes).filter((k) => changes[k as keyof typeof changes] !== undefined);
      await auditLog({
        context: c, ...getUserInfoFromContext(c), action: "UPDATE", entityType: "sr",
        entityId: id, entityName: updated.name,
        oldValue: Object.fromEntries(changed.map((k) => [k, before[k as keyof typeof before]])),
        newValue: Object.fromEntries(changed.map((k) => [k, updated[k as keyof typeof updated]])),
        metadata: { event: "sr_profile_updated" },
      });
      return c.json({ success: true, data: updated, message: "Profile updated successfully" });
    } catch (error) {
      logError("Error updating SR profile:", error);
      return c.json({ success: false, message: "Failed to update profile" }, 500);
    }
  },
);

app.get("/:id/documents", requireRole(["admin"]), async (c) => {
  try {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid SR ID" }, 400);
    return c.json({ success: true, data: await srService.getSrDocuments(id) });
  } catch (error) {
    logError("Error fetching SR documents:", error);
    return c.json({ success: false, message: "Failed to fetch documents" }, 500);
  }
});

app.post(
  "/:id/documents",
  requireRole(["admin"]),
  zValidator("json", createSrDocumentSchema, firstIssue),
  async (c) => {
    try {
      const id = parseId(c.req.param("id"));
      if (!id) return c.json({ success: false, message: "Invalid SR ID" }, 400);
      const srRow = await srService.getSrById(id);
      if (!srRow) return c.json({ success: false, message: "SR not found" }, 404);
      const document = await srService.addSrDocument(id, c.req.valid("json"));
      await auditLog({
        context: c, ...getUserInfoFromContext(c), action: "UPDATE", entityType: "sr",
        entityId: id, entityName: srRow.name, metadata: { event: "sr_document_added", documentId: document.id },
        newValue: { srId: id, documentType: document.documentType, documentName: document.documentName },
      });
      return c.json({ success: true, data: document, message: "Document added successfully" }, 201);
    } catch (error) {
      logError("Error adding SR document:", error);
      return c.json({ success: false, message: "Failed to add document" }, 500);
    }
  },
);

app.delete("/:id/documents/:docId", requireRole(["admin"]), async (c) => {
  try {
    const id = parseId(c.req.param("id"));
    const docId = parseId(c.req.param("docId"));
    if (!id || !docId) return c.json({ success: false, message: "Invalid SR or document ID" }, 400);
    const deleted = await srService.deleteSrDocument(id, docId);
    if (!deleted) return c.json({ success: false, message: "Document not found" }, 404);
    await auditLog({
      context: c, ...getUserInfoFromContext(c), action: "UPDATE", entityType: "sr",
      entityId: id, metadata: { event: "sr_document_deleted", documentId: docId },
      oldValue: { srId: id, documentType: deleted.documentType, documentName: deleted.documentName, documentUrl: deleted.documentUrl },
    });
    return c.json({ success: true, message: "Document deleted successfully" });
  } catch (error) {
    logError("Error deleting SR document:", error);
    return c.json({ success: false, message: "Failed to delete document" }, 500);
  }
});

// ==================== Merge duplicates (Admin only) ====================

// Moves everything recorded under the duplicate SRs to this SR, gives it all of their
// companies, and deletes the duplicates. { preview: true } reports what would happen.
app.post(
  "/:id/merge",
  requireRole(["admin"]),
  zValidator("json", mergeSrsSchema, firstIssue),
  async (c) => {
    try {
      const id = parseId(c.req.param("id"));
      if (!id) return c.json({ success: false, message: "Invalid SR ID" }, 400);
      const { sourceIds, preview } = c.req.valid("json");
      const result = await mergeSrs(id, sourceIds, { preview: !!preview });
      if (!preview) {
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
          context: c, ...userInfo, action: "UPDATE", entityType: "sr",
          entityId: id, entityName: result.kept.name,
          newValue: { companyIds: result.companyIds, filledProfileFields: result.filledProfileFields, openingDue: result.openingDue },
          metadata: { event: "sr_merged", merged: result.merged, moved: result.moved },
        });
        for (const dupe of result.merged) {
          await auditLog({
            context: c, ...userInfo, action: "DELETE", entityType: "sr",
            entityId: dupe.id, entityName: dupe.name,
            metadata: { event: "sr_merged_into", keptSrId: id, keptSrName: result.kept.name },
          });
        }
      }
      return c.json({
        success: true,
        data: result,
        message: preview ? "Merge preview" : `Merged ${result.merged.length} SR${result.merged.length === 1 ? "" : "s"} into ${result.kept.name}`,
      });
    } catch (error) {
      if (error instanceof srService.SrInputError) return c.json({ success: false, message: error.message }, 400);
      logError("Error merging SRs:", error);
      return c.json({ success: false, message: "Failed to merge SRs" }, 500);
    }
  },
);

// Delete an SR (Admin only)
app.delete("/:id", requireRole(["admin"]), srController.handleDeleteSr);

export default app;
