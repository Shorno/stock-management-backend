import { db } from "../../db/config";
import { stockAdjustments, stockBatch, productVariant, product } from "../../db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import type { CreateStockAdjustmentInput, GetStockAdjustmentsQuery, GetBatchesQuery } from "./validation";
import { createStockAdjustmentSchema } from "./validation";
import { recordStockPurchase } from "../stock-batch/purchase";

// Response types
export interface StockAdjustmentRecord {
    id: number;
    batchId: number | null;
    variantId: number;
    adjustmentType: string;
    quantity: number;
    freeQuantity: number;
    orderId: number | null;
    returnId: number | null;
    note: string | null;
    createdBy: number | null;
    createdAt: Date;
    // Related data
    variantLabel?: string | null;
    productName?: string | null;
}

export interface BatchInfo {
    id: number;
    variantId: number;
    supplierPrice: string;
    sellPrice: string;
    initialQuantity: number;
    remainingQuantity: number;
    remainingFreeQty: number;
    createdAt: Date;
}

/**
 * Purchases add to both received and available quantities; returns only restore availability.
 */
export const createStockAdjustment = async (
    input: CreateStockAdjustmentInput,
    createdBy?: number,
    database = db,
): Promise<
    | { success: false; message: string }
    | { success: true; message: string; adjustmentId: number; stockValueChange: number; purchaseAmount: number; netAssetChange: number }
> => {
    const parsed = createStockAdjustmentSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, message: parsed.error.issues[0]?.message || "Invalid stock adjustment" };
    }
    const { batchId, variantId, adjustmentType, quantity, freeQuantity, orderId, returnId, note } = parsed.data;
    const isPurchase = adjustmentType === "restock";

    return database.transaction(async (tx) => {
        // Lock the chosen batch so prices and quantities remain consistent throughout the purchase.
        const [batch] = await tx
            .select()
            .from(stockBatch)
            .where(eq(stockBatch.id, batchId))
            .for("update");

        if (!batch) {
            return { success: false as const, message: "Stock batch not found" };
        }
        if (batch.variantId !== variantId) {
            return { success: false as const, message: "Batch does not belong to this variant" };
        }
        if (batch.remainingQuantity + quantity < 0 || batch.remainingFreeQty + freeQuantity < 0) {
            return { success: false as const, message: "Insufficient stock for this adjustment" };
        }

        await tx.update(stockBatch).set({
            remainingQuantity: sql`${stockBatch.remainingQuantity} + ${quantity}`,
            remainingFreeQty: sql`${stockBatch.remainingFreeQty} + ${freeQuantity}`,
            ...(isPurchase ? {
                initialQuantity: sql`${stockBatch.initialQuantity} + ${quantity}`,
                initialFreeQty: sql`${stockBatch.initialFreeQty} + ${freeQuantity}`,
            } : {}),
        }).where(eq(stockBatch.id, batchId));

        // Even an opening batch can receive a new purchase later. Its original opening stock stays intact.
        const purchaseAmount = isPurchase ? await recordStockPurchase(tx, batch, quantity, true) : 0;

        // Create adjustment record
        const [adjustment] = await tx
            .insert(stockAdjustments)
            .values({
                batchId,
                variantId,
                adjustmentType,
                quantity,
                freeQuantity,
                orderId: orderId || null,
                returnId: returnId || null,
                note: note || null,
                createdBy: createdBy || null,
            })
            .returning({ id: stockAdjustments.id });

        if (!adjustment) throw new Error("Failed to record stock adjustment");
        const stockValueChange = Number(batch.supplierPrice) * quantity;
        return {
            success: true as const,
            message: `${isPurchase ? "Stock purchased" : "Stock adjustment recorded"} successfully. ${quantity >= 0 ? "Added" : "Removed"} ${Math.abs(quantity)} units.`,
            adjustmentId: adjustment.id,
            stockValueChange,
            purchaseAmount,
            // A purchase adds matching stock and supplier debt; a return adds only stock.
            netAssetChange: isPurchase ? 0 : stockValueChange,
        };
    });
};

/**
 * Get stock adjustments with optional filters
 */
export const getStockAdjustments = async (
    query: GetStockAdjustmentsQuery
): Promise<StockAdjustmentRecord[]> => {
    const conditions = [];

    if (query.variantId) {
        conditions.push(eq(stockAdjustments.variantId, query.variantId));
    }
    if (query.batchId) {
        conditions.push(eq(stockAdjustments.batchId, query.batchId));
    }
    if (query.adjustmentType) {
        conditions.push(eq(stockAdjustments.adjustmentType, query.adjustmentType));
    }

    const results = await db
        .select({
            id: stockAdjustments.id,
            batchId: stockAdjustments.batchId,
            variantId: stockAdjustments.variantId,
            adjustmentType: stockAdjustments.adjustmentType,
            quantity: stockAdjustments.quantity,
            freeQuantity: stockAdjustments.freeQuantity,
            orderId: stockAdjustments.orderId,
            returnId: stockAdjustments.returnId,
            note: stockAdjustments.note,
            createdBy: stockAdjustments.createdBy,
            createdAt: stockAdjustments.createdAt,
            variantLabel: productVariant.label,
            productName: product.name,
        })
        .from(stockAdjustments)
        .leftJoin(productVariant, eq(stockAdjustments.variantId, productVariant.id))
        .leftJoin(product, eq(productVariant.productId, product.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(stockAdjustments.createdAt))
        .limit(query.limit)
        .offset(query.offset);

    return results;
};

/**
 * Get batches for a specific variant (for restock batch selection)
 */
export const getBatchesForVariant = async (
    query: GetBatchesQuery
): Promise<BatchInfo[]> => {
    const results = await db
        .select({
            id: stockBatch.id,
            variantId: stockBatch.variantId,
            supplierPrice: stockBatch.supplierPrice,
            sellPrice: stockBatch.sellPrice,
            initialQuantity: stockBatch.initialQuantity,
            remainingQuantity: stockBatch.remainingQuantity,
            remainingFreeQty: stockBatch.remainingFreeQty,
            createdAt: stockBatch.createdAt,
        })
        .from(stockBatch)
        .where(eq(stockBatch.variantId, query.variantId))
        .orderBy(desc(stockBatch.createdAt));

    return results;
};
