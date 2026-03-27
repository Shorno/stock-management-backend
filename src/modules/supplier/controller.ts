import type { Context } from "hono";
import * as supplierService from "./service";
import { formatDatabaseError, logError } from "../../lib/error-handler";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import { recordEntry } from "../net-asset-ledger/service";

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

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        const amount = body.amount;
        const financialImpact: FinancialImpact = {
            amount,
            description: `Supplier purchase of ৳${amount.toLocaleString()} from brand #${brandId}`,
            affectedMetrics: [
                { metric: "supplierDue", label: "Supplier Due", direction: "increase", amount },
                { metric: "netPurchase", label: "Net Purchase", direction: "increase", amount },
            ],
        };
        await auditLog({
            context: c,
            ...userInfo,
            action: "CREATE",
            entityType: "supplier_purchase",
            entityId: (purchase as any).id,
            entityName: `Purchase ৳${amount.toLocaleString()}`,
            newValue: purchase,
            metadata: { financialImpact, brandId },
        });

        // Record net asset ledger entry (neutral: stock value ↑, supplier due ↓)
        await recordEntry({
            transactionType: "supplier_purchase",
            description: `Supplier purchase from brand #${brandId} — ৳${amount.toLocaleString()}`,
            amount,
            netAssetChange: 0,
            affectedComponent: "supplierDue",
            entityType: "supplier_purchase",
            entityId: (purchase as any).id,
            transactionDate: body.purchaseDate,
        });

        return c.json({ success: true, data: purchase }, 201);
    } catch (error) {
        logError("Error adding purchase:", error);
        return c.json({ success: false, error: "Failed to add purchase" }, 500);
    }
}

export async function handleDeletePurchase(c: Context) {
    try {
        const id = Number(c.req.param("purchaseId"));
        const brandId = Number(c.req.param("id"));
        await supplierService.deletePurchase(id);

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "DELETE",
            entityType: "supplier_purchase",
            entityId: id,
            entityName: `Supplier Purchase #${id}`,
            metadata: { brandId, description: "Deleted supplier purchase" },
        });

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

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        const amount = body.amount;
        const financialImpact: FinancialImpact = {
            amount,
            description: `Supplier payment of ৳${amount.toLocaleString()} to brand #${brandId}${body.fromCashBalance ? " (from cash)" : ""}`,
            affectedMetrics: [
                { metric: "supplierDue", label: "Supplier Due", direction: "decrease", amount },
                ...(body.fromCashBalance ? [{ metric: "cashBalance", label: "Cash Balance", direction: "decrease" as const, amount }] : []),
            ],
        };
        await auditLog({
            context: c,
            ...userInfo,
            action: "PAYMENT",
            entityType: "supplier_payment",
            entityId: (payment as any).id,
            entityName: `Payment ৳${amount.toLocaleString()}`,
            newValue: payment,
            metadata: { financialImpact, brandId },
        });

        // Record net asset ledger entry (neutral: cash ↓ if from cash, supplier due ↑)
        await recordEntry({
            transactionType: "supplier_payment",
            description: `Supplier payment to brand #${brandId} — ৳${amount.toLocaleString()}${body.fromCashBalance ? " (from cash)" : ""}`,
            amount,
            netAssetChange: 0,
            affectedComponent: body.fromCashBalance ? "cash" : "supplierDue",
            entityType: "supplier_payment",
            entityId: (payment as any).id,
            transactionDate: body.paymentDate,
        });

        return c.json({ success: true, data: payment }, 201);
    } catch (error) {
        logError("Error adding payment:", error);
        return c.json({ success: false, error: formatDatabaseError(error, "payment") }, 400);
    }
}

export async function handleDeletePayment(c: Context) {
    try {
        const id = Number(c.req.param("paymentId"));
        const brandId = Number(c.req.param("id"));
        await supplierService.deletePayment(id);

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "DELETE",
            entityType: "supplier_payment",
            entityId: id,
            entityName: `Supplier Payment #${id}`,
            metadata: { brandId, description: "Deleted supplier payment" },
        });

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

// ==================== PRODUCT BATCH HISTORY ====================

export async function handleGetSupplierProductBatches(c: Context) {
    try {
        const brandId = Number(c.req.param("id"));
        const batches = await supplierService.getSupplierProductBatches(brandId);
        return c.json({ success: true, data: batches });
    } catch (error) {
        logError("Error fetching supplier product batches:", error);
        return c.json({ success: false, error: "Failed to fetch product batches" }, 500);
    }
}
