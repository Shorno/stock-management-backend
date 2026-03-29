import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { dailySalesCollectionQuerySchema, dsrLedgerQuerySchema, dsrLedgerOverviewQuerySchema, productWiseSalesQuerySchema, brandWiseSalesQuerySchema, dailySettlementQuerySchema, brandWisePurchaseQuerySchema, srSalesQuerySchema } from "./validation";
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

// Get SR Wise Sales report (overview)
app.get(
    "/sr-sales",
    zValidator("query", srSalesQuerySchema, (result, ctx) => {
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
            const data = await reportsService.getSrWiseSales(query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching SR wise sales:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch SR sales report",
                },
                500
            );
        }
    }
);

// Get SR Sales Details (product-level for a specific SR)
app.get(
    "/sr-sales/:srId",
    zValidator("query", srSalesQuerySchema, (result, ctx) => {
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
            const srId = Number(ctx.req.param("srId"));
            if (isNaN(srId)) {
                return ctx.json({ success: false, message: "Invalid SR ID" }, 400);
            }

            const query = ctx.req.valid("query");
            const data = await reportsService.getSrSalesDetails(srId, query);

            return ctx.json({
                success: true,
                data,
            });
        } catch (error) {
            logError("Error fetching SR sales details:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to fetch SR sales details",
                },
                500
            );
        }
    }
);

// ==================== INVENTORY SNAPSHOT ====================

import { inventorySnapshotQuerySchema } from "./validation";
import { takeInventorySnapshot } from "../../jobs/inventory-snapshot";
import { db } from "../../db/config";
import { inventorySnapshots } from "../../db/schema";
import { eq, and, like, desc } from "drizzle-orm";

// Get inventory snapshot for a date
app.get(
    "/inventory-snapshot",
    zValidator("query", inventorySnapshotQuerySchema, (result, ctx) => {
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

            // If no date specified, get the latest snapshot date
            let snapshotDate = query.date;
            if (!snapshotDate) {
                const latest = await db
                    .select({ date: inventorySnapshots.snapshotDate })
                    .from(inventorySnapshots)
                    .orderBy(desc(inventorySnapshots.snapshotDate))
                    .limit(1);
                snapshotDate = latest[0]?.date;
            }

            if (!snapshotDate) {
                return ctx.json({
                    success: true,
                    data: { items: [], summary: { totalProducts: 0, totalQuantity: 0, totalStockValue: "0.00", totalSellValue: "0.00" }, snapshotDate: null },
                });
            }

            // Build conditions
            const conditions = [eq(inventorySnapshots.snapshotDate, snapshotDate)];
            if (query.search) {
                conditions.push(like(inventorySnapshots.productName, `%${query.search}%`));
            }
            if (query.brandId) {
                conditions.push(eq(inventorySnapshots.brandId, query.brandId));
            }

            const rawItems = await db
                .select()
                .from(inventorySnapshots)
                .where(and(...conditions))
                .orderBy(inventorySnapshots.productName, inventorySnapshots.variantLabel);

            // Group by product + variant, keeping individual batches
            const groupMap = new Map<string, {
                productId: number;
                variantId: number;
                brandId: number;
                productName: string;
                variantLabel: string;
                brandName: string;
                remainingQuantity: number;
                remainingFreeQty: number;
                unit: string | null;
                totalCostValue: number;
                totalSellValue: number;
                batchCount: number;
                batches: {
                    batchId: number;
                    supplierPrice: string;
                    sellPrice: string;
                    remainingQuantity: number;
                    remainingFreeQty: number;
                    stockValue: string;
                }[];
            }>();

            for (const item of rawItems) {
                const key = `${item.productId}-${item.variantId}`;
                const existing = groupMap.get(key);
                const qty = item.remainingQuantity;
                const costVal = qty * parseFloat(item.supplierPrice);
                const sellVal = qty * parseFloat(item.sellPrice);

                const batchDetail = {
                    batchId: item.batchId,
                    supplierPrice: item.supplierPrice,
                    sellPrice: item.sellPrice,
                    remainingQuantity: qty,
                    remainingFreeQty: item.remainingFreeQty,
                    stockValue: costVal.toFixed(2),
                };

                if (existing) {
                    existing.remainingQuantity += qty;
                    existing.remainingFreeQty += item.remainingFreeQty;
                    existing.totalCostValue += costVal;
                    existing.totalSellValue += sellVal;
                    existing.batchCount += 1;
                    existing.batches.push(batchDetail);
                } else {
                    groupMap.set(key, {
                        productId: item.productId,
                        variantId: item.variantId,
                        brandId: item.brandId,
                        productName: item.productName,
                        variantLabel: item.variantLabel,
                        brandName: item.brandName,
                        remainingQuantity: qty,
                        remainingFreeQty: item.remainingFreeQty,
                        unit: item.unit,
                        totalCostValue: costVal,
                        totalSellValue: sellVal,
                        batchCount: 1,
                        batches: [batchDetail],
                    });
                }
            }

            // Build grouped items with weighted average prices + batch subRows
            const groupedItems = Array.from(groupMap.values()).map((g) => ({
                productId: g.productId,
                variantId: g.variantId,
                brandId: g.brandId,
                productName: g.productName,
                variantLabel: g.variantLabel,
                brandName: g.brandName,
                remainingQuantity: g.remainingQuantity,
                remainingFreeQty: g.remainingFreeQty,
                unit: g.unit,
                supplierPrice: g.remainingQuantity > 0 ? (g.totalCostValue / g.remainingQuantity).toFixed(6) : "0.000000",
                sellPrice: g.remainingQuantity > 0 ? (g.totalSellValue / g.remainingQuantity).toFixed(6) : "0.000000",
                stockValue: g.totalCostValue.toFixed(2),
                sellValue: g.totalSellValue.toFixed(2),
                batchCount: g.batchCount,
                batches: g.batches,
            }));

            // Calculate summary
            let totalQuantity = 0;
            let totalStockValue = 0;
            let totalSellValue = 0;
            const uniqueProducts = new Set<number>();

            for (const item of groupedItems) {
                totalQuantity += item.remainingQuantity;
                totalStockValue += parseFloat(item.stockValue);
                totalSellValue += parseFloat(item.sellValue);
                uniqueProducts.add(item.productId);
            }

            return ctx.json({
                success: true,
                data: {
                    items: groupedItems,
                    summary: {
                        totalProducts: uniqueProducts.size,
                        totalQuantity,
                        totalStockValue: totalStockValue.toFixed(2),
                        totalSellValue: totalSellValue.toFixed(2),
                    },
                    snapshotDate,
                },
            });
        } catch (error) {
            logError("Error fetching inventory snapshot:", error);
            return ctx.json(
                { success: false, message: error instanceof Error ? error.message : "Failed to fetch inventory snapshot" },
                500
            );
        }
    }
);

// Take snapshot now (manual trigger)
app.post("/inventory-snapshot/take", async (ctx) => {
    try {
        const body = await ctx.req.json().catch(() => ({}));
        const date = body?.date as string | undefined;

        // Always determine the target date and delete existing snapshot before re-taking
        const targetDate = date ?? new Date().toISOString().split("T")[0]!;
        await db.delete(inventorySnapshots).where(eq(inventorySnapshots.snapshotDate, targetDate));

        const count = await takeInventorySnapshot(targetDate);

        return ctx.json({
            success: true,
            message: count === -1
                ? "Snapshot already exists for this date"
                : `Snapshot created with ${count} batch records`,
            count,
        });
    } catch (error) {
        logError("Error taking inventory snapshot:", error);
        return ctx.json(
            { success: false, message: error instanceof Error ? error.message : "Failed to take snapshot" },
            500
        );
    }
});

// Get available snapshot dates
app.get("/inventory-snapshot/dates", async (ctx) => {
    try {
        const dates = await db
            .selectDistinct({ date: inventorySnapshots.snapshotDate })
            .from(inventorySnapshots)
            .orderBy(desc(inventorySnapshots.snapshotDate));

        return ctx.json({
            success: true,
            data: dates.map(d => d.date),
        });
    } catch (error) {
        logError("Error fetching snapshot dates:", error);
        return ctx.json(
            { success: false, message: error instanceof Error ? error.message : "Failed to fetch snapshot dates" },
            500
        );
    }
});

// Get/update snapshot schedule time
import { globalSettings } from "../../db/schema";
import { scheduleSnapshotCron, getCurrentSchedule } from "../../jobs/inventory-snapshot";

app.get("/inventory-snapshot/schedule", async (ctx) => {
    try {
        const settings = await db.query.globalSettings.findFirst();
        const schedule = getCurrentSchedule();
        return ctx.json({
            success: true,
            data: {
                time: settings?.snapshotTime || "23:59",
                cronExpression: schedule.cronExpression,
            },
        });
    } catch (error) {
        logError("Error fetching snapshot schedule:", error);
        return ctx.json(
            { success: false, message: "Failed to fetch schedule" },
            500
        );
    }
});

app.put("/inventory-snapshot/schedule", async (ctx) => {
    try {
        const body = await ctx.req.json();
        const time = body?.time as string;

        // Validate HH:MM format
        if (!time || !/^\d{2}:\d{2}$/.test(time)) {
            return ctx.json({ success: false, message: "Invalid time format. Use HH:MM (e.g. 23:59)" }, 400);
        }

        const parts = time.split(":").map(Number);
        const hours = parts[0]!;
        const minutes = parts[1]!;
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return ctx.json({ success: false, message: "Invalid time values" }, 400);
        }

        // Update in DB
        const settings = await db.query.globalSettings.findFirst();
        if (settings) {
            await db.update(globalSettings)
                .set({ snapshotTime: time })
                .where(eq(globalSettings.id, settings.id));
        } else {
            await db.insert(globalSettings).values({ snapshotTime: time });
        }

        // Reschedule the cron job
        await scheduleSnapshotCron();

        return ctx.json({
            success: true,
            message: `Snapshot scheduled daily at ${time}`,
            data: { time },
        });
    } catch (error) {
        logError("Error updating snapshot schedule:", error);
        return ctx.json(
            { success: false, message: error instanceof Error ? error.message : "Failed to update schedule" },
            500
        );
    }
});

export default app;
