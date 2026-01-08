import type { Context } from "hono";
import * as supplierService from "./service";

// ==================== SUPPLIER HANDLERS ====================

export async function handleGetAllSuppliers(c: Context) {
    try {
        const suppliers = await supplierService.getAllSuppliers();
        return c.json({ success: true, data: suppliers });
    } catch (error) {
        console.error("Error fetching suppliers:", error);
        return c.json({ success: false, error: "Failed to fetch suppliers" }, 500);
    }
}

export async function handleGetSupplierById(c: Context) {
    try {
        const id = Number(c.req.param("id"));
        const supplier = await supplierService.getSupplierById(id);

        if (!supplier) {
            return c.json({ success: false, error: "Supplier not found" }, 404);
        }

        return c.json({ success: true, data: supplier });
    } catch (error) {
        console.error("Error fetching supplier:", error);
        return c.json({ success: false, error: "Failed to fetch supplier" }, 500);
    }
}

export async function handleCreateSupplier(c: Context) {
    try {
        const body = await c.req.json();

        if (!body.name) {
            return c.json({ success: false, error: "Supplier name is required" }, 400);
        }

        const supplier = await supplierService.createSupplier(body);
        return c.json({ success: true, data: supplier }, 201);
    } catch (error) {
        console.error("Error creating supplier:", error);
        return c.json({ success: false, error: "Failed to create supplier" }, 500);
    }
}

export async function handleUpdateSupplier(c: Context) {
    try {
        const id = Number(c.req.param("id"));
        const body = await c.req.json();

        const supplier = await supplierService.updateSupplier(id, body);

        if (!supplier) {
            return c.json({ success: false, error: "Supplier not found" }, 404);
        }

        return c.json({ success: true, data: supplier });
    } catch (error) {
        console.error("Error updating supplier:", error);
        return c.json({ success: false, error: "Failed to update supplier" }, 500);
    }
}

export async function handleDeleteSupplier(c: Context) {
    try {
        const id = Number(c.req.param("id"));
        await supplierService.deleteSupplier(id);
        return c.json({ success: true, message: "Supplier deleted successfully" });
    } catch (error) {
        console.error("Error deleting supplier:", error);
        return c.json({ success: false, error: "Failed to delete supplier" }, 500);
    }
}

// ==================== PURCHASE HANDLERS ====================

export async function handleAddPurchase(c: Context) {
    try {
        const supplierId = Number(c.req.param("id"));
        const body = await c.req.json();

        if (!body.amount || !body.purchaseDate) {
            return c.json({ success: false, error: "Amount and purchase date are required" }, 400);
        }

        const purchase = await supplierService.addPurchase(supplierId, body);
        return c.json({ success: true, data: purchase }, 201);
    } catch (error) {
        console.error("Error adding purchase:", error);
        return c.json({ success: false, error: "Failed to add purchase" }, 500);
    }
}

export async function handleDeletePurchase(c: Context) {
    try {
        const id = Number(c.req.param("purchaseId"));
        await supplierService.deletePurchase(id);
        return c.json({ success: true, message: "Purchase deleted successfully" });
    } catch (error) {
        console.error("Error deleting purchase:", error);
        return c.json({ success: false, error: "Failed to delete purchase" }, 500);
    }
}

// ==================== PAYMENT HANDLERS ====================

export async function handleAddPayment(c: Context) {
    try {
        const supplierId = Number(c.req.param("id"));
        const body = await c.req.json();

        if (!body.amount || !body.paymentDate) {
            return c.json({ success: false, error: "Amount and payment date are required" }, 400);
        }

        const payment = await supplierService.addPayment(supplierId, body);
        return c.json({ success: true, data: payment }, 201);
    } catch (error) {
        console.error("Error adding payment:", error);
        return c.json({ success: false, error: "Failed to add payment" }, 500);
    }
}

export async function handleDeletePayment(c: Context) {
    try {
        const id = Number(c.req.param("paymentId"));
        await supplierService.deletePayment(id);
        return c.json({ success: true, message: "Payment deleted successfully" });
    } catch (error) {
        console.error("Error deleting payment:", error);
        return c.json({ success: false, error: "Failed to delete payment" }, 500);
    }
}

// ==================== BALANCE HANDLERS ====================

export async function handleGetTotalSupplierDue(c: Context) {
    try {
        const totalDue = await supplierService.getTotalSupplierDue();
        return c.json({ success: true, data: { totalDue } });
    } catch (error) {
        console.error("Error fetching total supplier due:", error);
        return c.json({ success: false, error: "Failed to fetch total supplier due" }, 500);
    }
}
