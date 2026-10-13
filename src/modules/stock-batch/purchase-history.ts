import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { db } from "../../db/config";
import { stockAdjustments, stockBatch } from "../../db/schema";

export interface PurchaseDateRange { startDate?: string; endDate?: string }

/** Keep each receipt on its own date even when its quantity is merged into an older batch. */
export function stockPurchaseReceipts(database: Pick<typeof db, "select">) {
    const totals = database.select({
        batchId: stockAdjustments.batchId,
        quantity: sql<number>`SUM(${stockAdjustments.quantity})`.as("restock_quantity"),
        freeQuantity: sql<number>`SUM(${stockAdjustments.freeQuantity})`.as("restock_free_quantity"),
    }).from(stockAdjustments).where(eq(stockAdjustments.adjustmentType, "restock"))
        .groupBy(stockAdjustments.batchId).as("restock_totals");

    const originalReceipts = database.select({
        batchId: sql<number>`${stockBatch.id}`.as("batch_id"),
        variantId: stockBatch.variantId,
        supplierPrice: stockBatch.supplierPrice,
        quantity: sql<number>`${stockBatch.initialQuantity} - COALESCE(${totals.quantity}, 0)`.as("quantity"),
        freeQuantity: sql<number>`${stockBatch.initialFreeQty} - COALESCE(${totals.freeQuantity}, 0)`.as("free_quantity"),
        receivedAt: stockBatch.createdAt,
    }).from(stockBatch).leftJoin(totals, eq(totals.batchId, stockBatch.id));

    const restockReceipts = database.select({
        batchId: sql<number>`${stockBatch.id}`.as("batch_id"),
        variantId: stockBatch.variantId,
        supplierPrice: stockBatch.supplierPrice,
        quantity: sql<number>`${stockAdjustments.quantity}`.as("quantity"),
        freeQuantity: sql<number>`${stockAdjustments.freeQuantity}`.as("free_quantity"),
        receivedAt: stockAdjustments.createdAt,
    }).from(stockAdjustments).innerJoin(stockBatch, eq(stockAdjustments.batchId, stockBatch.id))
        .where(eq(stockAdjustments.adjustmentType, "restock"));

    return originalReceipts.unionAll(restockReceipts).as("stock_receipts");
}

export function purchaseDateFilter(receipts: ReturnType<typeof stockPurchaseReceipts>, range?: PurchaseDateRange) {
    const endExclusive = range?.endDate ? new Date(range.endDate) : undefined;
    if (endExclusive) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return and(
        range?.startDate ? gte(receipts.receivedAt, new Date(range.startDate)) : undefined,
        endExclusive ? lt(receipts.receivedAt, endExclusive) : undefined,
    );
}

export async function getStockPurchaseValue(database: Pick<typeof db, "select">, range?: PurchaseDateRange) {
    const receipts = stockPurchaseReceipts(database);
    const [result] = await database.select({
        value: sql<string>`COALESCE(SUM(${receipts.supplierPrice} * ${receipts.quantity}), 0)`,
    }).from(receipts).where(purchaseDateFilter(receipts, range));
    return Number(result?.value || 0);
}
