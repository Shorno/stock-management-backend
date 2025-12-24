import { Hono } from "hono";
import * as controller from "./controller";
import { requireAuth, requireRole } from "../../lib/auth-middleware";

const dsrTargetRoutes = new Hono();

// All routes require authentication
dsrTargetRoutes.use("*", requireAuth());

// GET /api/dsr-targets - List all targets (accessible to all authenticated)
dsrTargetRoutes.get("/", controller.handleGetAllTargets);

// GET /api/dsr-targets/progress - Get targets with progress
dsrTargetRoutes.get("/progress", controller.handleGetTargetsProgress);

// GET /api/dsr-targets/:id - Get single target
dsrTargetRoutes.get("/:id", controller.handleGetTargetById);

// POST /api/dsr-targets - Create target (Admin/Manager only)
dsrTargetRoutes.post("/", requireRole(["admin", "manager"]), controller.handleCreateTarget);

// PUT /api/dsr-targets/:id - Update target (Admin/Manager only)
dsrTargetRoutes.put("/:id", requireRole(["admin", "manager"]), controller.handleUpdateTarget);

// DELETE /api/dsr-targets/:id - Delete target (Admin/Manager only)
dsrTargetRoutes.delete("/:id", requireRole(["admin", "manager"]), controller.handleDeleteTarget);

export default dsrTargetRoutes;
