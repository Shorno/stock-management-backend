import { db } from "../../db/config";
import { billTypes } from "../../db/schema";
import { eq, asc } from "drizzle-orm";
import type { CreateBillTypeInput, UpdateBillTypeInput } from "./validation";

export interface BillType {
    id: number;
    code: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Get all bill types ordered by name
 */
export const getBillTypes = async (): Promise<BillType[]> => {
    return db.select().from(billTypes).orderBy(asc(billTypes.name));
};

/**
 * Get a single bill type by ID
 */
export const getBillTypeById = async (id: number): Promise<BillType | undefined> => {
    const [result] = await db.select().from(billTypes).where(eq(billTypes.id, id));
    return result;
};

/**
 * Create a new bill type
 */
export const createBillType = async (input: CreateBillTypeInput): Promise<BillType> => {
    const [newBillType] = await db
        .insert(billTypes)
        .values({
            code: input.code.toUpperCase(),
            name: input.name,
        })
        .returning();

    return newBillType!;
};

/**
 * Update a bill type
 */
export const updateBillType = async (id: number, input: UpdateBillTypeInput): Promise<BillType | null> => {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.code !== undefined) updateData.code = input.code.toUpperCase();
    if (input.name !== undefined) updateData.name = input.name;

    const [updated] = await db
        .update(billTypes)
        .set(updateData)
        .where(eq(billTypes.id, id))
        .returning();

    return updated || null;
};

/**
 * Delete a bill type
 */
export const deleteBillType = async (id: number): Promise<boolean> => {
    const result = await db
        .delete(billTypes)
        .where(eq(billTypes.id, id))
        .returning({ id: billTypes.id });

    return result.length > 0;
};
