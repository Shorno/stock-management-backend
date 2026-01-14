import { db } from "../../db/config";
import { stockBatch, productVariant, product, supplierPurchases } from "../../db/schema";
import { eq, count } from "drizzle-orm";
import type { CreateStockBatchInput, UpdateStockBatchInput, GetStockBatchesQuery } from "./validation";
import type { StockBatch, NewStockBatch } from "./types";
import { format } from "date-fns";

export const createStockBatch = async (
    variantId: number,
    data: CreateStockBatchInput
): Promise<StockBatch> => {
    const newBatch: NewStockBatch = {
        variantId,
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

    // Auto-create supplier purchase for the brand
    // Get variant → product → brand chain
    const variant = await db.query.productVariant.findFirst({
        where: (v, { eq }) => eq(v.id, variantId),
        with: {
            product: {
                with: {
                    brand: true,
                },
            },
        },
    });

    if (variant?.product?.brand?.id) {
        const purchaseAmount = data.supplierPrice * data.quantity;
        const productName = variant.product.name;
        const variantLabel = variant.label;

        // Create supplier purchase entry
        await db.insert(supplierPurchases).values({
            brandId: variant.product.brand.id,
            amount: purchaseAmount.toString(),
            purchaseDate: format(new Date(), "yyyy-MM-dd"),
            description: `Stock batch: ${productName} (${variantLabel}) - ${data.quantity} units @ ৳${data.supplierPrice}`,
        });
    }

    return createdBatch;
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

export const deleteStockBatch = async (id: number): Promise<boolean> => {
    const result = await db.delete(stockBatch).where(eq(stockBatch.id, id)).returning();
    return result.length > 0;
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

