
import { db } from "./src/db/config";
import { damageReturns, damageReturnItems, stockBatch } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Debugging Return RET-20260114-0001...");

    const ret = await db.query.damageReturns.findFirst({
        where: eq(damageReturns.returnNumber, "RET-20260114-0001"),
        with: {
            items: {
                with: {
                    batch: true
                }
            }
        }
    });

    if (!ret) {
        console.log("Return not found");
        return;
    }

    console.log("Return found:", ret.returnNumber);
    for (const item of ret.items) {
        console.log(`Item ID: ${item.id}`);
        console.log(`  Quantity: ${item.quantity}`);
        console.log(`  Unit Price (Stored): ${item.unitPrice}`);
        console.log(`  Batch ID: ${item.batchId}`);
        if (item.batch) {
            console.log(`  Batch Sell Price: ${item.batch.sellPrice}`);
            console.log(`  Batch Supplier Price: ${item.batch.supplierPrice}`);
        } else {
            console.log("  No Batch Linked");
        }
    }
}

main().catch(console.error).then(() => process.exit(0));
