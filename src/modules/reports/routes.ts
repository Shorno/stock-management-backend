import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { dailySalesCollectionQuerySchema, dsrLedgerQuerySchema, dsrLedgerOverviewQuerySchema } from "./validation";
import * as reportsService from "./service";

const app = new Hono();

// Get daily sales and collection report
app.get(
    "/daily-sales-collection",
    zValidator("query", dailySalesCollectionQuerySchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json(
                {
                    success: false,
                    message: "Invalid query parameters",
                    errors: result.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                },
                400
            );
        }
    }),
    async (ctx) => {
        try {
            const query = ctx.req.valid("query");
            const data = await reportsService.getDailySalesCollection(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            console.error("Error fetching daily sales collection:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch report",
                },
                500
            );
        }
    }
);

// Get DSR Ledger report (for single DSR)
app.get(
    "/dsr-ledger",
    zValidator("query", dsrLedgerQuerySchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json(
                {
                    success: false,
                    message: "Invalid query parameters",
                    errors: result.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                },
                400
            );
        }
    }),
    async (ctx) => {
        try {
            const query = ctx.req.valid("query");
            const data = await reportsService.getDsrLedger(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            console.error("Error fetching DSR ledger:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch DSR ledger",
                },
                500
            );
        }
    }
);

// Get DSR Ledger Overview (all DSRs summary)
app.get(
    "/dsr-ledger-overview",
    zValidator("query", dsrLedgerOverviewQuerySchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json(
                {
                    success: false,
                    message: "Invalid query parameters",
                    errors: result.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                },
                400
            );
        }
    }),
    async (ctx) => {
        try {
            const query = ctx.req.valid("query");
            const data = await reportsService.getAllDsrLedgerSummaries(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            console.error("Error fetching DSR ledger overview:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch DSR ledger overview",
                },
                500
            );
        }
    }
);

export default app;

