import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as dueCollectionService from "./service";
import { logError } from "../../lib/error-handler";
import {
    getCustomersWithDuesQuerySchema,
    collectDueInputSchema,
    getCollectionHistoryQuerySchema,
    getDSRDueSummaryQuerySchema,
    getDSRCollectionHistoryQuerySchema,
    collectDsrDueInputSchema,
    getSRDueSummaryQuerySchema,
    getSRCollectionHistoryQuerySchema,
    collectSrDueInputSchema,
} from "./validation";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import { recordEntry } from "../net-asset-ledger/service";

const dueCollectionRoutes = new Hono();

// Get customers with outstanding dues
dueCollectionRoutes.get(
    "/customers",
    zValidator("query", getCustomersWithDuesQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const customers = await dueCollectionService.getCustomersWithDues(query);
            return c.json({ success: true, data: customers });
        } catch (error) {
            logError("Error fetching customers with dues:", error);
            return c.json({ success: false, error: "Failed to fetch customers" }, 500);
        }
    }
);

// Get customer due details
dueCollectionRoutes.get("/customers/:customerId", async (c) => {
    try {
        const customerId = Number(c.req.param("customerId"));
        if (isNaN(customerId)) {
            return c.json({ success: false, error: "Invalid customer ID" }, 400);
        }

        const details = await dueCollectionService.getCustomerDueDetails(customerId);
        if (!details) {
            return c.json({ success: false, error: "Customer not found" }, 404);
        }

        return c.json({ success: true, data: details });
    } catch (error) {
        logError("Error fetching customer due details:", error);
        return c.json({ success: false, error: "Failed to fetch customer details" }, 500);
    }
});

// Collect due
dueCollectionRoutes.post(
    "/collect",
    zValidator("json", collectDueInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await dueCollectionService.collectDue(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            // Audit log
            const userInfo = getUserInfoFromContext(c);
            const amount = input.amount;
            const financialImpact: FinancialImpact = {
                amount,
                description: `Collected ৳${amount.toLocaleString()} due from customer #${input.customerId}`,
                affectedMetrics: [
                    { metric: "cashBalance", label: "Cash Balance", direction: "increase", amount },
                    { metric: "dsrSalesDue", label: "DSR Sales Due", direction: "decrease", amount },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "PAYMENT",
                entityType: "due_collection",
                entityId: result.collectionId!,
                entityName: `Due Collection ৳${amount.toLocaleString()}`,
                newValue: input,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry (neutral: cash ↑, customerDue ↓)
            await recordEntry({
                transactionType: "due_collection_customer",
                description: `Customer due collected — ৳${amount.toLocaleString()} from customer #${input.customerId}`,
                amount,
                netAssetChange: 0,
                affectedComponent: "cash",
                entityType: "due_collection",
                entityId: result.collectionId!,
                transactionDate: input.collectionDate,
            });

            return c.json({
                success: true,
                message: result.message,
                collectionId: result.collectionId
            });
        } catch (error) {
            logError("Error collecting due:", error);
            return c.json({ success: false, error: "Failed to record collection" }, 500);
        }
    }
);

// Get collection history
dueCollectionRoutes.get(
    "/history",
    zValidator("query", getCollectionHistoryQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const history = await dueCollectionService.getCollectionHistory(query);
            return c.json({ success: true, data: history });
        } catch (error) {
            logError("Error fetching collection history:", error);
            return c.json({ success: false, error: "Failed to fetch history" }, 500);
        }
    }
);

// ==================== DSR DUE TRACKING ROUTES ====================

// Get DSR due summary (all DSRs with their outstanding dues)
dueCollectionRoutes.get(
    "/dsr-summary",
    zValidator("query", getDSRDueSummaryQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const summary = await dueCollectionService.getDSRDueSummary(query);
            return c.json({ success: true, data: summary });
        } catch (error) {
            logError("Error fetching DSR due summary:", error);
            return c.json({ success: false, error: "Failed to fetch DSR summary" }, 500);
        }
    }
);

// Get detailed dues for a specific DSR's orders
dueCollectionRoutes.get("/dsr/:dsrId/dues", async (c) => {
    try {
        const dsrId = Number(c.req.param("dsrId"));
        if (isNaN(dsrId)) {
            return c.json({ success: false, error: "Invalid DSR ID" }, 400);
        }

        const details = await dueCollectionService.getDSRDueDetails(dsrId);
        return c.json({ success: true, data: details });
    } catch (error) {
        logError("Error fetching DSR due details:", error);
        return c.json({ success: false, error: "Failed to fetch DSR details" }, 500);
    }
});

// Get collection history for a specific DSR's orders
dueCollectionRoutes.get(
    "/dsr/:dsrId/collections",
    zValidator("query", getDSRCollectionHistoryQuerySchema),
    async (c) => {
        try {
            const dsrId = Number(c.req.param("dsrId"));
            if (isNaN(dsrId)) {
                return c.json({ success: false, error: "Invalid DSR ID" }, 400);
            }

            const query = c.req.valid("query");
            const history = await dueCollectionService.getDSRCollectionHistory({
                ...query,
                dsrId
            });
            return c.json({ success: true, data: history });
        } catch (error) {
            logError("Error fetching DSR collection history:", error);
            return c.json({ success: false, error: "Failed to fetch DSR collection history" }, 500);
        }
    }
);

// Get DSR's own due collection history (money DSR paid back to company)
dueCollectionRoutes.get(
    "/dsr/:dsrId/own-collections",
    zValidator("query", getDSRCollectionHistoryQuerySchema),
    async (c) => {
        try {
            const dsrId = Number(c.req.param("dsrId"));
            if (isNaN(dsrId)) {
                return c.json({ success: false, error: "Invalid DSR ID" }, 400);
            }

            const query = c.req.valid("query");
            const history = await dueCollectionService.getDSROwnDueCollectionHistory({
                ...query,
                dsrId
            });
            return c.json({ success: true, data: history });
        } catch (error) {
            logError("Error fetching DSR own due collection history:", error);
            return c.json({ success: false, error: "Failed to fetch DSR own due collection history" }, 500);
        }
    }
);

// Collect DSR's own due (from order adjustments)
dueCollectionRoutes.post(
    "/dsr/collect",
    zValidator("json", collectDsrDueInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await dueCollectionService.collectDsrDue(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            // Audit log
            const userInfo = getUserInfoFromContext(c);
            const amount = input.amount;
            const financialImpact: FinancialImpact = {
                amount,
                description: `Collected ৳${amount.toLocaleString()} DSR due from DSR #${input.dsrId}`,
                affectedMetrics: [
                    { metric: "cashBalance", label: "Cash Balance", direction: "increase", amount },
                    { metric: "dsrOwnDue", label: "DSR Own Due", direction: "decrease", amount },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "PAYMENT",
                entityType: "dsr_due_collection",
                entityId: String(input.dsrId),
                entityName: `DSR Due Collection ৳${amount.toLocaleString()}`,
                newValue: input,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry (neutral: cash ↑, dsrDue ↓)
            await recordEntry({
                transactionType: "due_collection_dsr",
                description: `DSR due collected — ৳${amount.toLocaleString()} from DSR #${input.dsrId}`,
                amount,
                netAssetChange: 0,
                affectedComponent: "cash",
                entityType: "dsr_due_collection",
                entityId: input.dsrId,
                transactionDate: input.collectionDate,
            });

            return c.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            logError("Error collecting DSR due:", error);
            return c.json({ success: false, error: "Failed to record DSR collection" }, 500);
        }
    }
);

// ==================== SR DUE TRACKING ROUTES ====================

// Get SR due summary (all SRs with their outstanding dues)
dueCollectionRoutes.get(
    "/sr-summary",
    zValidator("query", getSRDueSummaryQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const summary = await dueCollectionService.getSRDueSummary(query);
            return c.json({ success: true, data: summary });
        } catch (error) {
            logError("Error fetching SR due summary:", error);
            return c.json({ success: false, error: "Failed to fetch SR summary" }, 500);
        }
    }
);

// Get detailed dues for a specific SR
dueCollectionRoutes.get("/sr/:srId/dues", async (c) => {
    try {
        const srId = Number(c.req.param("srId"));
        if (isNaN(srId)) {
            return c.json({ success: false, error: "Invalid SR ID" }, 400);
        }

        const details = await dueCollectionService.getSRDueDetails(srId);
        return c.json({ success: true, data: details });
    } catch (error) {
        logError("Error fetching SR due details:", error);
        return c.json({ success: false, error: "Failed to fetch SR details" }, 500);
    }
});

// Get collection history for a specific SR
dueCollectionRoutes.get(
    "/sr/:srId/collections",
    zValidator("query", getSRCollectionHistoryQuerySchema),
    async (c) => {
        try {
            const srId = Number(c.req.param("srId"));
            if (isNaN(srId)) {
                return c.json({ success: false, error: "Invalid SR ID" }, 400);
            }

            const query = c.req.valid("query");
            const history = await dueCollectionService.getSRCollectionHistory({
                ...query,
                srId
            });
            return c.json({ success: true, data: history });
        } catch (error) {
            logError("Error fetching SR collection history:", error);
            return c.json({ success: false, error: "Failed to fetch SR collection history" }, 500);
        }
    }
);

// Collect SR's own due (from order adjustments)
dueCollectionRoutes.post(
    "/sr/collect",
    zValidator("json", collectSrDueInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await dueCollectionService.collectSrDue(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            // Audit log
            const userInfo = getUserInfoFromContext(c);
            const amount = input.amount;
            const financialImpact: FinancialImpact = {
                amount,
                description: `Collected \u09f3${amount.toLocaleString()} SR due from SR #${input.srId}`,
                affectedMetrics: [
                    { metric: "cashBalance", label: "Cash Balance", direction: "increase", amount },
                    { metric: "srOwnDue", label: "SR Own Due", direction: "decrease", amount },
                ],
            };
            await auditLog({
                context: c,
                ...userInfo,
                action: "PAYMENT",
                entityType: "sr_due_collection",
                entityId: String(input.srId),
                entityName: `SR Due Collection \u09f3${amount.toLocaleString()}`,
                newValue: input,
                metadata: { financialImpact },
            });

            // Record net asset ledger entry (neutral: cash ↑, srDue ↓)
            await recordEntry({
                transactionType: "due_collection_sr",
                description: `SR due collected — ৳${amount.toLocaleString()} from SR #${input.srId}`,
                amount,
                netAssetChange: 0,
                affectedComponent: "cash",
                entityType: "sr_due_collection",
                entityId: input.srId,
                transactionDate: input.collectionDate,
            });

            return c.json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            logError("Error collecting SR due:", error);
            return c.json({ success: false, error: "Failed to record SR collection" }, 500);
        }
    }
);

export { dueCollectionRoutes };
