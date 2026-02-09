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
} from "./validation";

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

export { dueCollectionRoutes };
