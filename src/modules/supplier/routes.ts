import { Hono } from "hono";
import * as controller from "./controller";
import { requireRole } from "../../lib/auth-middleware";

export const supplierRoutes = new Hono();

// Get all companies (brands) with supplier balance
supplierRoutes.get("/", controller.handleGetAllSuppliers);
supplierRoutes.get("/total-due", controller.handleGetTotalSupplierDue);

// Get single company (brand) with purchases and payments
supplierRoutes.get("/:id", controller.handleGetSupplierById);

// Purchases (linked to brand ID)
supplierRoutes.post("/:id/purchases", controller.handleAddPurchase);
// Delete purchase (Admin only)
supplierRoutes.delete("/:id/purchases/:purchaseId", requireRole(["admin"]), controller.handleDeletePurchase);

// Payments (linked to brand ID)
supplierRoutes.post("/:id/payments", controller.handleAddPayment);
// Delete payment (Admin only)
supplierRoutes.delete("/:id/payments/:paymentId", requireRole(["admin"]), controller.handleDeletePayment);
