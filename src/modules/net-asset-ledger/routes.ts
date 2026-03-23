import { Hono } from "hono";
import * as ledgerController from "./controller";

const netAssetLedgerRoutes = new Hono();

// Get ledger entries (with running balance, pagination, date filter)
netAssetLedgerRoutes.get("/", ledgerController.handleGetLedger);

// Get ledger summary (totals for date range)
netAssetLedgerRoutes.get("/summary", ledgerController.handleGetLedgerSummary);

// Backfill ledger from existing data (admin only)
netAssetLedgerRoutes.post("/backfill", ledgerController.handleBackfill);

export { netAssetLedgerRoutes };
