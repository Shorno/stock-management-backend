import { db } from "../db/config";
import { inventorySnapshots, stockBatch, productVariant, product, brand } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Take a snapshot of the current inventory state for a given date.
 * Idempotent — if a snapshot already exists for that date, it's skipped.
 * Returns the number of rows inserted, or -1 if already exists.
 */
export async function takeInventorySnapshot(snapshotDate?: string): Promise<number> {
    const dateStr = snapshotDate ?? new Date().toISOString().split("T")[0]!;

    // Check if snapshot already exists for this date
    const existing = await db
        .select({ id: inventorySnapshots.id })
        .from(inventorySnapshots)
        .where(eq(inventorySnapshots.snapshotDate, dateStr))
        .limit(1);

    if (existing.length > 0) {
        console.log(`[Snapshot] Snapshot for ${dateStr} already exists, skipping.`);
        return -1;
    }

    // Get all batches with product info
    const batches = await db
        .select({
            batchId: stockBatch.id,
            variantId: stockBatch.variantId,
            productId: product.id,
            brandId: product.brandId,
            productName: product.name,
            variantLabel: productVariant.label,
            brandName: brand.name,
            supplierPrice: stockBatch.supplierPrice,
            sellPrice: stockBatch.sellPrice,
            remainingQuantity: stockBatch.remainingQuantity,
            remainingFreeQty: stockBatch.remainingFreeQty,
            unit: stockBatch.unit,
        })
        .from(stockBatch)
        .innerJoin(productVariant, eq(stockBatch.variantId, productVariant.id))
        .innerJoin(product, eq(productVariant.productId, product.id))
        .innerJoin(brand, eq(product.brandId, brand.id));

    if (batches.length === 0) {
        console.log(`[Snapshot] No batches found, nothing to snapshot.`);
        return 0;
    }

    // Bulk insert
    await db.insert(inventorySnapshots).values(
        batches.map((b) => ({
            snapshotDate: dateStr,
            batchId: b.batchId,
            variantId: b.variantId,
            productId: b.productId,
            brandId: b.brandId,
            productName: b.productName,
            variantLabel: b.variantLabel,
            brandName: b.brandName,
            supplierPrice: b.supplierPrice,
            sellPrice: b.sellPrice,
            remainingQuantity: b.remainingQuantity,
            remainingFreeQty: b.remainingFreeQty,
            unit: b.unit,
        }))
    );

    console.log(`[Snapshot] Created snapshot for ${dateStr} with ${batches.length} batch records.`);
    return batches.length;
}

/**
 * Start the automatic daily snapshot scheduler.
 * Time is read from SNAPSHOT_TIME env var (HH:MM format, 24h), defaults to "23:59".
 */
export function startSnapshotScheduler() {
    const snapshotTime = process.env.SNAPSHOT_TIME || "23:59";
    const [hours, minutes] = snapshotTime.split(":").map(Number);

    console.log(`[Snapshot] Scheduler started — will take daily snapshot at ${snapshotTime}`);

    // Check every 60 seconds if it's time
    setInterval(async () => {
        const now = new Date();
        if (now.getHours() === hours && now.getMinutes() === minutes) {
            try {
                const today = now.toISOString().split("T")[0];
                await takeInventorySnapshot(today);
            } catch (err) {
                console.error("[Snapshot] Error taking scheduled snapshot:", err);
            }
        }
    }, 60_000); // Check every minute
}
