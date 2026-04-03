import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createDsrSchema,
  updateDsrSchema,
  getDsrsQuerySchema,
  updateDsrProfileSchema,
  createDsrDocumentSchema,
} from "./validation";
import * as dsrController from "./controller";
import { requireRole } from "../../lib/auth-middleware";

const app = new Hono();

// Validation error handler
const validationError = (result: any, ctx: any) => {
  if (!result.success) {
    return ctx.json(
      {
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map((issue: any) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }
};

app.post(
  "/",
  zValidator("json", createDsrSchema, validationError),
  dsrController.handleCreateDsr
);

app.get(
  "/",
  zValidator("query", getDsrsQuerySchema, validationError),
  dsrController.handleGetDsrs
);

app.get("/:id", dsrController.handleGetDsrById);

// Update a DSR (Admin only)
app.put(
  "/:id",
  requireRole(["admin"]),
  zValidator("json", updateDsrSchema, validationError),
  dsrController.handleUpdateDsr
);

// Delete a DSR (Admin only)
app.delete("/:id", requireRole(["admin"]), dsrController.handleDeleteDsr);

// ==================== Profile (Super Admin only) ====================

// Update DSR profile
app.patch(
  "/:id/profile",
  requireRole(["super_admin"]),
  zValidator("json", updateDsrProfileSchema, validationError),
  dsrController.handleUpdateDsrProfile
);

// ==================== Documents (Super Admin only) ====================

// Get all documents for a DSR
app.get("/:id/documents", requireRole(["super_admin"]), dsrController.handleGetDsrDocuments);

// Add a document to a DSR
app.post(
  "/:id/documents",
  requireRole(["super_admin"]),
  zValidator("json", createDsrDocumentSchema, validationError),
  dsrController.handleAddDsrDocument
);

// Delete a document
app.delete(
  "/:id/documents/:docId",
  requireRole(["super_admin"]),
  dsrController.handleDeleteDsrDocument
);

export default app;
