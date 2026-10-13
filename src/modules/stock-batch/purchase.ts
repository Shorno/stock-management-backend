import { eq, sql } from "drizzle-orm";
import { format } from "date-fns";
import type { db } from "../../db/config";
import { product, productVariant, supplierPurchases } from "../../db/schema";
import type { StockBatch } from "./types";

/** Shared purchasing rules for new batches and additional stock in an existing batch. */
export async function recordStockPurchase(
    tx: Pick<typeof db, "select" | "insert">,
    batch: Pick<StockBatch, "id" | "variantId" | "supplierPrice">,
    quantity: number,
    isRestock = false,
) {
    const [variant] = await tx
        .select({ label: productVariant.label, productName: product.name, brandId: product.brandId })
        .from(productVariant)
        .innerJoin(product, eq(productVariant.productId, product.id))
        .where(eq(productVariant.id, batch.variantId));

    if (!variant) throw new Error("Product variant not found");

    const price = Number(batch.supplierPrice);
    const prefix = isRestock ? `Stock restock: Batch #${batch.id}` : "Stock batch:";
    const [purchase] = await tx.insert(supplierPurchases).values({
        stockBatchId: batch.id,
        brandId: variant.brandId,
        amount: sql`${batch.supplierPrice}::numeric * ${quantity}`,
        purchaseDate: format(new Date(), "yyyy-MM-dd"),
        description: `${prefix} ${variant.productName} (${variant.label}) - ${quantity} units @ ৳${price}`,
    }).returning({ amount: supplierPurchases.amount });

    if (!purchase) throw new Error("Failed to record supplier purchase");
    return Number(purchase.amount);
}
