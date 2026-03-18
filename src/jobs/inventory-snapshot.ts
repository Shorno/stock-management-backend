import { db } from "../db/config";
import { inventorySnapshots, stockBatch, productVariant, product, brand } from "../db/schema";
import { eq } from "drizzle-orm";
import cron from "node-cron";

let currentTask: ReturnType<typeof cron.schedule> | null = null;
let currentCronExpression: string | null = null;

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
 * Convert HH:MM to a cron expression: "MM HH * * *"
 */
function timeToCron(time: string): string {
    const [hours, minutes] = time.split(":");
    return `${minutes} ${hours} * * *`;
}

/**
 * Get the snapshot time from the database, falling back to "23:59"
 */
async function getSnapshotTimeFromDB(): Promise<string> {
    try {
        const settings = await db.query.globalSettings.findFirst();
        return settings?.snapshotTime || "23:59";
    } catch {
        return "23:59";
    }
}

/**
 * Schedule or reschedule the daily snapshot cron job.
 * Reads the time from the database (globalSettings.snapshotTime).
 */
export async function scheduleSnapshotCron() {
    const time = await getSnapshotTimeFromDB();
    const cronExpr = timeToCron(time);

    // Skip if already scheduled with the same expression
    if (currentCronExpression === cronExpr && currentTask) {
        return;
    }

    // Stop previous task if exists
    if (currentTask) {
        currentTask.stop();
        console.log(`[Snapshot] Stopped previous cron schedule.`);
    }

    currentTask = cron.schedule(cronExpr, async () => {
        try {
            const today = new Date().toISOString().split("T")[0]!;
            console.log(`[Snapshot] Cron triggered at ${new Date().toISOString()}`);
            await takeInventorySnapshot(today);
        } catch (err) {
            console.error("[Snapshot] Error taking scheduled snapshot:", err);
        }
    }, {
        timezone: "Asia/Dhaka"
    });

    currentCronExpression = cronExpr;
    console.log(`[Snapshot] Cron scheduled: "${cronExpr}" (daily at ${time})`);
}

/**
 * Get the currently scheduled time
 */
export function getCurrentSchedule(): { time: string; cronExpression: string | null } {
    return {
        time: currentCronExpression
            ? currentCronExpression.split(" ").slice(0, 2).reverse().join(":")
            : "23:59",
        cronExpression: currentCronExpression,
    };
}
