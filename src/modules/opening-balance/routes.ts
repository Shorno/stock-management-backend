import { Hono } from "hono";
import { logError } from "../../lib/error-handler";
import { zValidator } from "@hono/zod-validator";
import * as openingBalanceService from "./service";
import { upsertOpeningBalanceSchema, getOpeningBalancesQuerySchema } from "./validation";
import { recordEntry } from "../net-asset-ledger/service";

const openingBalanceRoutes = new Hono();

// Get all opening balances (optionally filtered by type)
openingBalanceRoutes.get(
    "/",
    zValidator("query", getOpeningBalancesQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const balances = await openingBalanceService.getOpeningBalances(query);
            return c.json({ success: true, data: balances });
        } catch (error) {
            logError("Error fetching opening balances:", error);
            return c.json({ success: false, error: "Failed to fetch opening balances" }, 500);
        }
    }
);

// Get opening balance for a specific entity
openingBalanceRoutes.get("/:type/:entityId", async (c) => {
    try {
        const type = c.req.param("type");
        const entityIdParam = c.req.param("entityId");
        const entityId = entityIdParam === "global" ? null : Number(entityIdParam);

        if (entityIdParam !== "global" && isNaN(entityId!)) {
            return c.json({ success: false, error: "Invalid entity ID" }, 400);
        }

        const balance = await openingBalanceService.getByEntity(type, entityId);
        return c.json({ success: true, data: balance });
    } catch (error) {
        logError("Error fetching opening balance:", error);
        return c.json({ success: false, error: "Failed to fetch opening balance" }, 500);
    }
});

// Upsert (create or update) an opening balance
openingBalanceRoutes.put(
    "/",
    zValidator("json", upsertOpeningBalanceSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await openingBalanceService.upsertOpeningBalance(input);

            // Record net asset ledger entry
            const amount = parseFloat(input.amount);
            const componentMap: Record<string, string> = {
                cash: "cash", customer_due: "customerDue", dsr_due: "dsrDue",
                sr_due: "srDue", supplier_balance: "supplierDue",
                profit_loss: "profitLoss", investment: "investment", dsr_loan: "dsrDue",
            };
            const affectedComponent = componentMap[input.type] || input.type;
            const netAssetTypes = ["cash", "customer_due", "dsr_due", "sr_due", "supplier_balance"];
            const netAssetChange = netAssetTypes.includes(input.type) ? amount : 0;
            await recordEntry({
                transactionType: "opening_balance",
                description: `Opening balance set: ${input.type}${input.entityName ? ` (${input.entityName})` : ""} — ৳${Math.abs(amount).toLocaleString()}`,
                amount: Math.abs(amount),
                netAssetChange,
                affectedComponent,
                entityType: "opening_balance",
                entityId: result.id,
                transactionDate: input.balanceDate,
            });

            return c.json({ success: true, data: result, message: "Opening balance saved successfully" });
        } catch (error) {
            logError("Error saving opening balance:", error);
            return c.json({ success: false, error: "Failed to save opening balance" }, 500);
        }
    }
);

// Delete an opening balance
openingBalanceRoutes.delete("/:id", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, error: "Invalid ID" }, 400);
        }

        const deleted = await openingBalanceService.deleteOpeningBalance(id);
        if (!deleted) {
            return c.json({ success: false, error: "Opening balance not found" }, 404);
        }

        // Record net asset ledger entry
        await recordEntry({
            transactionType: "opening_balance_deleted",
            description: `Opening balance #${id} deleted`,
            amount: 0,
            netAssetChange: 0,
            affectedComponent: "cash",
            entityType: "opening_balance",
            entityId: id,
            transactionDate: new Date().toISOString().split("T")[0] as string,
        });

        return c.json({ success: true, message: "Opening balance deleted successfully" });
    } catch (error) {
        logError("Error deleting opening balance:", error);
        return c.json({ success: false, error: "Failed to delete opening balance" }, 500);
    }
});

export { openingBalanceRoutes };
