import type { Context } from "hono";
import * as supplierService from "./service";
import { formatDatabaseError, logError } from "../../lib/error-handler";

// ==================== COMPANY (BRAND) AS SUPPLIER HANDLERS ====================

export async function handleGetAllSuppliers(c: Context) {
    try {
        const suppliers = await supplierService.getAllSuppliers();
        return c.json({ success: true, data: suppliers });
    } catch (error) {
        logError("Error fetching suppliers:", error);
        return c.json({ success: false, error: "Failed to fetch suppliers" }, 500);
    }
}

export async function handleGetSupplierById(c: Context) {
    try {
        const id = Number(c.req.param("id"));
        const supplier = await supplierService.getSupplierById(id);

        if (!supplier) {
            return c.json({ success: false, error: "Company not found" }, 404);
        }

        return c.json({ success: true, data: supplier });
    } catch (error) {
        logError("Error fetching supplier:", error);
        return c.json({ success: false, error: "Failed to fetch supplier" }, 500);
    }
}

// ==================== PURCHASE HANDLERS ====================

export async function handleAddPurchase(c: Context) {
    try {
        const brandId = Number(c.req.param("id"));
        const body = await c.req.json();

        if (!body.amount || !body.purchaseDate) {
            return c.json({ success: false, error: "Amount and purchase date are required" }, 400);
        }

        const purchase = await supplierService.addPurchase(brandId, body);
        return c.json({ success: true, data: purchase }, 201);
    } catch (error) {
        logError("Error adding purchase:", error);
        return c.json({ success: false, error: "Failed to add purchase" }, 500);
    }
}

export async function handleDeletePurchase(c: Context) {
    try {
        const id = Number(c.req.param("purchaseId"));
        await supplierService.deletePurchase(id);
        return c.json({ success: true, message: "Purchase deleted successfully" });
    } catch (error) {
        logError("Error deleting purchase:", error);
        return c.json({ success: false, error: "Failed to delete purchase" }, 500);
    }
}

// ==================== PAYMENT HANDLERS ====================

export async function handleAddPayment(c: Context) {
    try {
        const brandId = Number(c.req.param("id"));
        const body = await c.req.json();

        if (!body.amount || !body.paymentDate) {
            return c.json({ success: false, error: "Amount and payment date are required" }, 400);
        }

        const payment = await supplierService.addPayment(brandId, body);
        return c.json({ success: true, data: payment }, 201);
    } catch (error) {
        logError("Error adding payment:", error);
        return c.json({ success: false, error: formatDatabaseError(error, "payment") }, 400);
    }
}

export async function handleDeletePayment(c: Context) {
    try {
        const id = Number(c.req.param("paymentId"));
        await supplierService.deletePayment(id);
        return c.json({ success: true, message: "Payment deleted successfully" });
    } catch (error) {
        logError("Error deleting payment:", error);
        return c.json({ success: false, error: "Failed to delete payment" }, 500);
    }
}

// ==================== BALANCE HANDLERS ====================

export async function handleGetTotalSupplierDue(c: Context) {
    try {
        const totalDue = await supplierService.getTotalSupplierDue();
        return c.json({ success: true, data: { totalDue } });
    } catch (error) {
        logError("Error fetching total supplier due:", error);
        return c.json({ success: false, error: "Failed to fetch total supplier due" }, 500);
    }
}
