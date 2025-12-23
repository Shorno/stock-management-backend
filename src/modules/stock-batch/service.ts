import { db } from "../../db/config";
import { stockBatch } from "../../db/schema";
import { eq, count } from "drizzle-orm";
import type { CreateStockBatchInput, UpdateStockBatchInput, GetStockBatchesQuery } from "./validation";
import type { StockBatch, NewStockBatch } from "./types";

export const createStockBatch = async (
    productId: number,
    data: CreateStockBatchInput
): Promise<StockBatch> => {
    const newBatch: NewStockBatch = {
        productId,
        supplierPrice: data.supplierPrice.toString(),
        sellPrice: data.sellPrice.toString(),
        initialQuantity: data.quantity,
        remainingQuantity: data.quantity,
        initialFreeQty: data.freeQuantity,
        remainingFreeQty: data.freeQuantity,
    };

    const [createdBatch] = await db.insert(stockBatch).values(newBatch).returning();
    if (!createdBatch) {
        throw new Error("Failed to create stock batch");
    }
    return createdBatch;
};

export const getStockBatchesByProductId = async (
    productId: number,
    query: GetStockBatchesQuery
): Promise<{ batches: StockBatch[]; total: number }> => {
    const [batches, totalResult] = await Promise.all([
        db.query.stockBatch.findMany({
            where: (batch, { eq }) => eq(batch.productId, productId),
            limit: query.limit,
            offset: query.offset,
            orderBy: (batch, { desc }) => [desc(batch.createdAt)],
        }),
        db
            .select({ count: count() })
            .from(stockBatch)
            .where(eq(stockBatch.productId, productId)),
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
            product: true,
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

export const deleteStockBatch = async (id: number): Promise<boolean> => {
    const result = await db.delete(stockBatch).where(eq(stockBatch.id, id)).returning();
    return result.length > 0;
};

// Computed totals for a product
export const getProductStockTotals = async (
    productId: number
): Promise<{ totalQuantity: number; totalFreeQuantity: number }> => {
    const batches = await db.query.stockBatch.findMany({
        where: (batch, { eq }) => eq(batch.productId, productId),
    });

    return batches.reduce(
        (acc, batch) => ({
            totalQuantity: acc.totalQuantity + batch.remainingQuantity,
            totalFreeQuantity: acc.totalFreeQuantity + batch.remainingFreeQty,
        }),
        { totalQuantity: 0, totalFreeQuantity: 0 }
    );
};
