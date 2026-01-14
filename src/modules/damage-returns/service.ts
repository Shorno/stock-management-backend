import { db } from "../../db/config";
import { damageReturns, damageReturnItems } from "../../db/schema";
import { stockBatch } from "../../db/schema";
import { eq, and, gte, lte, count, desc, sql } from "drizzle-orm";
import type { CreateDamageReturnInput, UpdateReturnStatusInput, GetDamageReturnsQuery } from "./validation";

// Generate return number
const generateReturnNumber = async (): Promise<string> => {
    const today = new Date();
    const prefix = `RET-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    // Count existing returns today
    const startOfDay = today.toISOString().split("T")[0]!;
    const existing = await db
        .select({ count: count() })
        .from(damageReturns)
        .where(gte(damageReturns.returnDate, startOfDay));

    const sequence = (existing[0]?.count || 0) + 1;
    return `${prefix}-${String(sequence).padStart(4, "0")}`;
};

// Create a new damage return
export const createDamageReturn = async (data: CreateDamageReturnInput) => {
    const returnNumber = await generateReturnNumber();

    // Fetch batches to get supplier prices
    const batchIds = data.items.map(i => i.batchId).filter(id => id !== undefined && id !== null) as number[];
    const batches = batchIds.length > 0 ? await db.query.stockBatch.findMany({
        where: sql`${stockBatch.id} IN (${sql.join(batchIds.map(id => sql`${id}`), sql`, `)})`,
    }) : [];

    const batchMap = new Map<number, typeof batches[0]>();
    batches.forEach(b => batchMap.set(b.id, b));

    // Calculate total using supplier prices where available
    const totalAmount = data.items.reduce((sum, item) => {
        let price = item.unitPrice; // Default to input price
        if (item.batchId && batchMap.has(item.batchId)) {
            price = Number(batchMap.get(item.batchId)?.supplierPrice || 0);
        }
        return sum + (item.quantity * price);
    }, 0);

    // Insert return
    const [createdReturn] = await db.insert(damageReturns).values({
        returnNumber,
        dsrId: data.dsrId,
        returnDate: data.returnDate,
        returnType: data.returnType,
        status: "pending",
        totalAmount: totalAmount.toFixed(2),
        notes: data.notes,
    }).returning();

    if (!createdReturn) {
        throw new Error("Failed to create damage return");
    }

    // Insert items
    const itemsToInsert = data.items.map(item => {
        let price = item.unitPrice;
        if (item.batchId && batchMap.has(item.batchId)) {
            price = Number(batchMap.get(item.batchId)?.supplierPrice || 0);
        }
        return {
            returnId: createdReturn.id,
            variantId: item.variantId,
            batchId: item.batchId,
            quantity: item.quantity,
            unitPrice: price.toFixed(2),
            total: (item.quantity * price).toFixed(2),
            condition: item.condition,
            reason: item.reason,
        };
    });

    await db.insert(damageReturnItems).values(itemsToInsert);

    return getDamageReturnById(createdReturn.id);
};

// Get all damage returns with filters
export const getDamageReturns = async (query: GetDamageReturnsQuery) => {
    const conditions = [];

    if (query.dsrId) {
        conditions.push(eq(damageReturns.dsrId, query.dsrId));
    }

    if (query.status) {
        conditions.push(eq(damageReturns.status, query.status));
    }

    if (query.returnType) {
        conditions.push(eq(damageReturns.returnType, query.returnType));
    }

    if (query.startDate) {
        conditions.push(gte(damageReturns.returnDate, query.startDate));
    }

    if (query.endDate) {
        conditions.push(lte(damageReturns.returnDate, query.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [returns, totalResult] = await Promise.all([
        db.query.damageReturns.findMany({
            where: whereClause,
            limit: query.limit,
            offset: query.offset,
            orderBy: [desc(damageReturns.returnDate), desc(damageReturns.id)],
            with: {
                dsr: true,
                items: {
                    with: {
                        variant: {
                            with: {
                                product: true,
                            },
                        },
                    },
                },
            },
        }),
        db.select({ count: count() }).from(damageReturns).where(whereClause),
    ]);

    return {
        returns,
        total: totalResult[0]?.count || 0,
    };
};

// Get single damage return by ID
export const getDamageReturnById = async (id: number) => {
    return await db.query.damageReturns.findFirst({
        where: eq(damageReturns.id, id),
        with: {
            dsr: true,
            items: {
                with: {
                    variant: {
                        with: {
                            product: true,
                        },
                    },
                    batch: true,
                },
            },
        },
    });
};

// Update damage return status (approve/reject)
export const updateDamageReturnStatus = async (
    id: number,
    data: UpdateReturnStatusInput,
    approvedById?: number
) => {
    const existingReturn = await getDamageReturnById(id);
    if (!existingReturn) {
        throw new Error("Damage return not found");
    }

    if (existingReturn.status !== "pending") {
        throw new Error("Can only update pending returns");
    }

    // Update status
    await db.update(damageReturns)
        .set({
            status: data.status,
            notes: data.notes ?? existingReturn.notes,
            approvedById: data.status !== "pending" ? approvedById : null,
            approvedAt: data.status !== "pending" ? new Date().toISOString().split("T")[0] : null,
        })
        .where(eq(damageReturns.id, id));

    // If approved and items are resellable, add back to stock
    if (data.status === "approved") {
        for (const item of existingReturn.items) {
            if (item.condition === "resellable" && item.batchId) {
                // Add quantity back to stock batch
                const batch = await db.query.stockBatch.findFirst({
                    where: eq(stockBatch.id, item.batchId),
                });

                if (batch) {
                    await db.update(stockBatch)
                        .set({
                            remainingQuantity: batch.remainingQuantity + item.quantity,
                        })
                        .where(eq(stockBatch.id, item.batchId));
                }
            }
            // Damaged items are written off - no stock update
        }
    }

    return getDamageReturnById(id);
};

// Delete damage return (only pending)
export const deleteDamageReturn = async (id: number) => {
    const existingReturn = await getDamageReturnById(id);
    if (!existingReturn) {
        throw new Error("Damage return not found");
    }

    if (existingReturn.status !== "pending") {
        throw new Error("Can only delete pending returns");
    }

    await db.delete(damageReturns).where(eq(damageReturns.id, id));
    return true;
};
