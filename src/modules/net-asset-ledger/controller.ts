import type { Context } from "hono";
import * as ledgerService from "./service";
import { logError } from "../../lib/error-handler";

/**
 * Get ledger entries with running balance
 */
export async function handleGetLedger(c: Context): Promise<Response> {
    try {
        const query = c.req.query();
        const result = await ledgerService.getLedger({
            startDate: query.startDate,
            endDate: query.endDate,
            page: query.page ? Number(query.page) : undefined,
            limit: query.limit ? Number(query.limit) : undefined,
            transactionType: query.transactionType,
        });
        return c.json({ success: true, data: result });
    } catch (error) {
        logError("Error fetching net asset ledger:", error);
        return c.json({ success: false, error: "Failed to fetch ledger" }, 500);
    }
}

/**
 * Get ledger summary (totals)
 */
export async function handleGetLedgerSummary(c: Context): Promise<Response> {
    try {
        const query = c.req.query();
        const summary = await ledgerService.getLedgerSummary(query.startDate, query.endDate);
        return c.json({ success: true, data: summary });
    } catch (error) {
        logError("Error fetching ledger summary:", error);
        return c.json({ success: false, error: "Failed to fetch summary" }, 500);
    }
}

/**
 * Backfill ledger from existing data (admin only)
 */
export async function handleBackfill(c: Context): Promise<Response> {
    try {
        // Check admin role
        const user = (c as any).get?.("user");
        if (!user || user.role !== "super_admin") {
            return c.json({ success: false, error: "Admin access required" }, 403);
        }

        const result = await ledgerService.backfillLedger();
        return c.json({
            success: true,
            message: `Backfill complete: ${result.entriesCreated} entries created`,
            data: result,
        });
    } catch (error) {
        logError("Error backfilling ledger:", error);
        return c.json({ success: false, error: "Failed to backfill ledger" }, 500);
    }
}
