import { Hono } from "hono";
import { logError } from "../../lib/error-handler";
import { zValidator } from "@hono/zod-validator";
import * as billsService from "./service";
import { createBillSchema, getBillsQuerySchema } from "./validation";
import { requireRole } from "../../lib/auth-middleware";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import { recordEntry } from "../net-asset-ledger/service";

const billsRoutes = new Hono();

// Get all bills
billsRoutes.get(
    "/",
    zValidator("query", getBillsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const bills = await billsService.getBills(query);
            return c.json({ success: true, data: bills });
        } catch (error) {
            logError("Error fetching bills:", error);
            return c.json({ success: false, error: "Failed to fetch bills" }, 500);
        }
    }
);

// Get bills summary
billsRoutes.get(
    "/summary",
    zValidator("query", getBillsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const summary = await billsService.getBillsSummary(query);
            return c.json({ success: true, data: summary });
        } catch (error) {
            logError("Error fetching bills summary:", error);
            return c.json({ success: false, error: "Failed to fetch summary" }, 500);
        }
    }
);

// Create a new bill
billsRoutes.post(
    "/",
    zValidator("json", createBillSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const bill = await billsService.createBill(input);

            // Audit log with financial impact
            const userInfo = getUserInfoFromContext(c);
            const amount = parseFloat(bill.amount);
            const financialImpact: FinancialImpact = {
                amount,
                description: `Created bill "${bill.title}" for ৳${amount.toLocaleString()}`,
                affectedMetrics: [
                    { metric: "cashBalance", label: "Cash Balance", direction: "decrease", amount },
                    { metric: "profitLoss", label: "Profit/Loss", direction: "decrease", amount },
                    { metric: "netAssets", label: "Net Assets", direction: "decrease", amount },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "CREATE",
                entityType: "bill",
                entityId: bill.id,
                entityName: bill.title,
                newValue: bill,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry
            await recordEntry({
                transactionType: "bill",
                description: `Bill: ${bill.title} — ৳${amount.toLocaleString()}`,
                amount,
                netAssetChange: -amount,
                affectedComponent: "cash",
                entityType: "bill",
                entityId: bill.id,
                transactionDate: input.billDate,
            });

            return c.json({ success: true, data: bill, message: "Bill created successfully" });
        } catch (error) {
            logError("Error creating bill:", error);
            return c.json({ success: false, error: "Failed to create bill" }, 500);
        }
    }
);

// Delete a bill (Admin only)
billsRoutes.delete("/:id", requireRole(["admin"]), async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, error: "Invalid bill ID" }, 400);
        }

        // Fetch bill data before deleting for audit log
        const allBills = await billsService.getBills({});
        const billToDelete = allBills.find(b => b.id === id);

        const deleted = await billsService.deleteBill(id);
        if (!deleted) {
            return c.json({ success: false, error: "Bill not found" }, 404);
        }

        // Audit log with financial impact
        if (billToDelete) {
            const userInfo = getUserInfoFromContext(c);
            const amount = parseFloat(billToDelete.amount);
            const financialImpact: FinancialImpact = {
                amount,
                description: `Deleted bill "${billToDelete.title}" of ৳${amount.toLocaleString()}`,
                affectedMetrics: [
                    { metric: "cashBalance", label: "Cash Balance", direction: "increase", amount },
                    { metric: "profitLoss", label: "Profit/Loss", direction: "increase", amount },
                    { metric: "netAssets", label: "Net Assets", direction: "increase", amount },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "DELETE",
                entityType: "bill",
                entityId: id,
                entityName: billToDelete.title,
                oldValue: billToDelete,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry
            await recordEntry({
                transactionType: "bill_deleted",
                description: `Bill deleted: ${billToDelete.title} — ৳${amount.toLocaleString()} restored`,
                amount,
                netAssetChange: amount,
                affectedComponent: "cash",
                entityType: "bill",
                entityId: id,
                transactionDate: billToDelete.billDate,
            });
        }

        return c.json({ success: true, message: "Bill deleted successfully" });
    } catch (error) {
        logError("Error deleting bill:", error);
        return c.json({ success: false, error: "Failed to delete bill" }, 500);
    }
});

export { billsRoutes };

