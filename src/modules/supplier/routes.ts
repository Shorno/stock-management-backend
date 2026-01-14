import { Hono } from "hono";
import * as controller from "./controller";

export const supplierRoutes = new Hono();

// Get all companies (brands) with supplier balance
supplierRoutes.get("/", controller.handleGetAllSuppliers);
supplierRoutes.get("/total-due", controller.handleGetTotalSupplierDue);

// Get single company (brand) with purchases and payments
supplierRoutes.get("/:id", controller.handleGetSupplierById);

// Purchases (linked to brand ID)
supplierRoutes.post("/:id/purchases", controller.handleAddPurchase);
supplierRoutes.delete("/:id/purchases/:purchaseId", controller.handleDeletePurchase);

// Payments (linked to brand ID)
supplierRoutes.post("/:id/payments", controller.handleAddPayment);
supplierRoutes.delete("/:id/payments/:paymentId", controller.handleDeletePayment);
