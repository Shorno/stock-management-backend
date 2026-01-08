import { Hono } from "hono";
import * as controller from "./controller";

export const supplierRoutes = new Hono();

// Supplier CRUD
supplierRoutes.get("/", controller.handleGetAllSuppliers);
supplierRoutes.get("/total-due", controller.handleGetTotalSupplierDue);
supplierRoutes.get("/:id", controller.handleGetSupplierById);
supplierRoutes.post("/", controller.handleCreateSupplier);
supplierRoutes.put("/:id", controller.handleUpdateSupplier);
supplierRoutes.delete("/:id", controller.handleDeleteSupplier);

// Purchases
supplierRoutes.post("/:id/purchases", controller.handleAddPurchase);
supplierRoutes.delete("/:id/purchases/:purchaseId", controller.handleDeletePurchase);

// Payments
supplierRoutes.post("/:id/payments", controller.handleAddPayment);
supplierRoutes.delete("/:id/payments/:paymentId", controller.handleDeletePayment);
