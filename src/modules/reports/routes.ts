import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { dailySalesCollectionQuerySchema, dsrLedgerQuerySchema, dsrLedgerOverviewQuerySchema, productWiseSalesQuerySchema, brandWiseSalesQuerySchema, dailySettlementQuerySchema, brandWisePurchaseQuerySchema } from "./validation";
import * as reportsService from "./service";
import { logError } from "../../lib/error-handler";

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
            logError("Error fetching daily sales collection:", error);
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
            logError("Error fetching DSR ledger:", error);
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

// Download DSR Ledger as PDF
app.get(
    "/dsr-ledger/pdf",
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

            // Import PDF generator dynamically to avoid circular deps
            const { generateDsrLedgerPdf } = await import("./pdf.service");
            const pdfBuffer = await generateDsrLedgerPdf(data);

            return new Response(pdfBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `attachment; filename="DSR_Ledger_${data.dsrName.replace(/\s+/g, "_")}.pdf"`,
                    "Content-Length": pdfBuffer.length.toString(),
                },
            });
        } catch (error) {
            logError("Error generating DSR ledger PDF:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to generate PDF",
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
            logError("Error fetching DSR ledger overview:", error);
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

// Get DSR Due Summary (all DSRs with outstanding dues)
app.get(
    "/dsr-due-summary",
    async (ctx) => {
        try {
            const data = await reportsService.getDsrDueSummary();

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching DSR due summary:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch DSR due summary",
                },
                500
            );
        }
    }
);

// Get Product Wise Sales report
app.get(
    "/product-wise-sales",
    zValidator("query", productWiseSalesQuerySchema, (result, ctx) => {
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
            const data = await reportsService.getProductWiseSales(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching product wise sales:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch product wise sales report",
                },
                500
            );
        }
    }
);

// Get Product Wise Sales with Variants (for expandable rows)
app.get(
    "/product-wise-sales-with-variants",
    zValidator("query", productWiseSalesQuerySchema, (result, ctx) => {
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
            const data = await reportsService.getProductWiseSalesWithVariants(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching product wise sales with variants:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch product wise sales report",
                },
                500
            );
        }
    }
);

// Get Brand Wise Sales report
app.get(
    "/brand-wise-sales",
    zValidator("query", brandWiseSalesQuerySchema, (result, ctx) => {
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
            const data = await reportsService.getBrandWiseSales(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching brand wise sales:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch brand wise sales report",
                },
                500
            );
        }
    }
);

// Get Daily Settlement report
app.get(
    "/daily-settlement",
    zValidator("query", dailySettlementQuerySchema, (result, ctx) => {
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
            const data = await reportsService.getDailySettlement(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching daily settlement:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch daily settlement report",
                },
                500
            );
        }
    }
);

// Get Brand Wise Purchase report
app.get(
    "/brand-wise-purchases",
    zValidator("query", brandWisePurchaseQuerySchema, (result, ctx) => {
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
            const data = await reportsService.getBrandWisePurchases(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching brand wise purchases:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch brand wise purchase report",
                },
                500
            );
        }
    }
);

export default app;

