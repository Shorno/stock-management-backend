import { db } from "../../db/config";
import { stockAdjustments, stockBatch, productVariant, product } from "../../db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import type { CreateStockAdjustmentInput, GetStockAdjustmentsQuery, GetBatchesQuery } from "./validation";

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
 * Create a stock adjustment (return restock, damage, or manual)
 */
export const createStockAdjustment = async (
    input: CreateStockAdjustmentInput,
    createdBy?: number
): Promise<{ success: boolean; message: string; adjustmentId?: number }> => {
    const { batchId, variantId, adjustmentType, quantity, freeQuantity, orderId, returnId, note } = input;

    // Validate variant exists
    const variantExists = await db
        .select({ id: productVariant.id })
        .from(productVariant)
        .where(eq(productVariant.id, variantId))
        .limit(1);

    if (!variantExists.length) {
        return { success: false, message: "Product variant not found" };
    }

    // If batchId provided, validate it exists and belongs to this variant
    if (batchId) {
        const batchExists = await db
            .select({ id: stockBatch.id, variantId: stockBatch.variantId, remainingQuantity: stockBatch.remainingQuantity })
            .from(stockBatch)
            .where(eq(stockBatch.id, batchId))
            .limit(1);

        if (!batchExists.length) {
            return { success: false, message: "Stock batch not found" };
        }

        if (batchExists[0]!.variantId !== variantId) {
            return { success: false, message: "Batch does not belong to this variant" };
        }

        // For negative adjustments, ensure we have enough stock
        if (quantity < 0) {
            const currentQty = batchExists[0]!.remainingQuantity;
            if (currentQty + quantity < 0) {
                return { success: false, message: `Insufficient stock. Current: ${currentQty}, Adjustment: ${quantity}` };
            }
        }
    }

    // Use transaction to ensure atomicity
    const result = await db.transaction(async (tx) => {
        // If batch is specified, update its quantity
        if (batchId) {
            await tx
                .update(stockBatch)
                .set({
                    remainingQuantity: sql`${stockBatch.remainingQuantity} + ${quantity}`,
                    remainingFreeQty: sql`${stockBatch.remainingFreeQty} + ${freeQuantity}`,
                })
                .where(eq(stockBatch.id, batchId));
        }

        // Create adjustment record
        const [adjustment] = await tx
            .insert(stockAdjustments)
            .values({
                batchId: batchId || null,
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

        return adjustment;
    });

    return {
        success: true,
        message: `Stock adjustment recorded successfully. ${quantity >= 0 ? "Added" : "Removed"} ${Math.abs(quantity)} units.`,
        adjustmentId: result?.id,
    };
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
