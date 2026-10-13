import { db } from "../../db/config";
import { stockBatch, stockAdjustments, supplierPurchases } from "../../db/schema";
import { eq, count, and, sql, isNull } from "drizzle-orm";
import type { CreateStockBatchInput, UpdateStockBatchInput, GetStockBatchesQuery } from "./validation";
import type { StockBatch, NewStockBatch } from "./types";
import { recordStockPurchase } from "./purchase";

export const createStockBatch = async (
    variantId: number,
    data: CreateStockBatchInput,
    database = db,
): Promise<StockBatch> => {
    const newBatch: NewStockBatch = {
        variantId,
        supplierPrice: data.supplierPrice.toString(),
        sellPrice: data.sellPrice.toString(),
        initialQuantity: data.quantity,
        remainingQuantity: data.quantity,
        initialFreeQty: data.freeQuantity,
        remainingFreeQty: data.freeQuantity,
        unit: data.unit,
        isOpeningStock: data.isOpeningStock || false,
    };

    return database.transaction(async (tx) => {
        const [createdBatch] = await tx.insert(stockBatch).values(newBatch).returning();
        if (!createdBatch) throw new Error("Failed to create stock batch");

        if (!data.isOpeningStock) {
            await recordStockPurchase(tx, createdBatch, data.quantity);
        }
        return createdBatch;
    });
};

export const getStockBatchesByVariantId = async (
    variantId: number,
    query: GetStockBatchesQuery
): Promise<{ batches: StockBatch[]; total: number }> => {
    const [batches, totalResult] = await Promise.all([
        db.query.stockBatch.findMany({
            where: (batch, { eq }) => eq(batch.variantId, variantId),
            limit: query.limit,
            offset: query.offset,
            orderBy: (batch, { desc }) => [desc(batch.createdAt)],
        }),
        db
            .select({ count: count() })
            .from(stockBatch)
            .where(eq(stockBatch.variantId, variantId)),
    ]);

    return {
        batches,
        total: totalResult[0]?.count || 0,
    };
};

export const getStockBatchById = async (id: number): Promise<StockBatch | undefined> => {
    return await db.query.stockBatch.findFirst({
        where: (batch, { eq }) => eq(batch.id, id),
        with: {
            variant: true,
        },
    });
};

export const updateStockBatch = async (
    id: number,
    data: UpdateStockBatchInput
): Promise<StockBatch | undefined> => {
    const updateData: Partial<NewStockBatch> = {};

    if (data.supplierPrice !== undefined) {
        updateData.supplierPrice = data.supplierPrice.toString();
    }
    if (data.sellPrice !== undefined) {
        updateData.sellPrice = data.sellPrice.toString();
    }
    if (data.remainingQuantity !== undefined) {
        updateData.remainingQuantity = data.remainingQuantity;
    }
    if (data.remainingFreeQty !== undefined) {
        updateData.remainingFreeQty = data.remainingFreeQty;
    }

    if (Object.keys(updateData).length === 0) {
        return getStockBatchById(id);
    }

    const [updatedBatch] = await db
        .update(stockBatch)
        .set(updateData)
        .where(eq(stockBatch.id, id))
        .returning();

    return updatedBatch;
};

export const deleteStockBatch = async (id: number, database = db): Promise<boolean> => {
    return database.transaction(async (tx) => {
        // Serialize deletion with restocking so supplier charges cannot be left behind.
        const [lockedBatch] = await tx.select({ id: stockBatch.id }).from(stockBatch)
            .where(eq(stockBatch.id, id)).for("update");
        if (!lockedBatch) return false;
        // Fetch the batch before deleting so we can reverse the supplier purchase
        const batch = await tx.query.stockBatch.findFirst({
            where: (b, { eq }) => eq(b.id, id),
            with: {
                variant: {
                    with: {
                        product: {
                            with: {
                                brand: true,
                            },
                        },
                    },
                },
            },
        });

        if (!batch) return false;

        const linkedPurchases = await tx.select({ description: supplierPurchases.description })
            .from(supplierPurchases).where(eq(supplierPurchases.stockBatchId, id));
        const hasLinkedOriginalPurchase = linkedPurchases.some(p => p.description?.startsWith("Stock batch:"));

        // Older batches predate the explicit purchase link. Their original purchase excludes later restocks.
        if (!batch.isOpeningStock && !hasLinkedOriginalPurchase && batch.variant?.product?.brand?.id) {
            const [restocks] = await tx.select({ quantity: sql<number>`COALESCE(SUM(${stockAdjustments.quantity}), 0)` })
                .from(stockAdjustments)
                .where(and(eq(stockAdjustments.batchId, id), eq(stockAdjustments.adjustmentType, "restock")));
            const originalQuantity = batch.initialQuantity - Number(restocks?.quantity || 0);
            const purchaseAmount = (Number(batch.supplierPrice) * originalQuantity).toFixed(2);
            const brandId = batch.variant.product.brand.id;
            const description = `Stock batch: ${batch.variant.product.name} (${batch.variant.label}) - ${originalQuantity} units @ ৳${Number(batch.supplierPrice)}`;

            // Find and delete the matching supplier purchase entry
            // Match by brandId and amount, with description pattern from batch creation
            const matchingPurchases = await tx
                .select({ id: supplierPurchases.id })
                .from(supplierPurchases)
                .where(
                    and(
                        eq(supplierPurchases.brandId, brandId),
                        eq(supplierPurchases.amount, purchaseAmount),
                        isNull(supplierPurchases.stockBatchId),
                        eq(supplierPurchases.description, description),
                    )
                )
                .limit(1);

            if (matchingPurchases.length > 0) {
                await tx.delete(supplierPurchases).where(eq(supplierPurchases.id, matchingPurchases[0]!.id));
            }
        }

        // Linked purchases (including restocks of opening batches) are removed by the foreign key.
        const result = await tx.delete(stockBatch).where(eq(stockBatch.id, id)).returning();
        return result.length > 0;
    });
};

// Computed totals for a variant
export const getVariantStockTotals = async (
    variantId: number
): Promise<{ totalQuantity: number; totalFreeQuantity: number }> => {
    const batches = await db.query.stockBatch.findMany({
        where: (batch, { eq }) => eq(batch.variantId, variantId),
    });

    return batches.reduce(
        (acc, batch) => ({
            totalQuantity: acc.totalQuantity + batch.remainingQuantity,
            totalFreeQuantity: acc.totalFreeQuantity + batch.remainingFreeQty,
        }),
        { totalQuantity: 0, totalFreeQuantity: 0 }
    );
};

