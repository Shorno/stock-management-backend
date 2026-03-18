import { db } from "../../db/config";
import { sr, srCommissions } from "../../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { logError } from "../../lib/error-handler";
import type { CreateCommissionInput, GetCommissionsQuery } from "./validation";

/**
 * Create a new commission entry for an SR
 */
export async function createCommission(input: CreateCommissionInput) {
    try {
        // Verify SR exists
        const srRecord = await db
            .select()
            .from(sr)
            .where(eq(sr.id, input.srId))
            .limit(1);

        if (srRecord.length === 0) {
            return { success: false, message: "SR not found" };
        }

        const result = await db
            .insert(srCommissions)
            .values({
                srId: input.srId,
                amount: input.amount.toString(),
                commissionDate: input.commissionDate,
                note: input.note || null,
            })
            .returning({ id: srCommissions.id });

        return {
            success: true,
            message: "Commission added successfully",
            commissionId: result[0]!.id,
        };
    } catch (error) {
        logError("Error creating SR commission:", error);
        return { success: false, message: "Failed to add commission" };
    }
}

/**
 * Get commissions for an SR with optional date filtering
 */
export async function getCommissions(srId: number, query: GetCommissionsQuery) {
    const conditions = [eq(srCommissions.srId, srId)];

    if (query.startDate) {
        conditions.push(gte(srCommissions.commissionDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(srCommissions.commissionDate, query.endDate));
    }

    const commissions = await db
        .select({
            id: srCommissions.id,
            srId: srCommissions.srId,
            amount: srCommissions.amount,
            commissionDate: srCommissions.commissionDate,
            note: srCommissions.note,
            createdAt: srCommissions.createdAt,
        })
        .from(srCommissions)
        .where(and(...conditions))
        .orderBy(desc(srCommissions.commissionDate), desc(srCommissions.createdAt));

    // Calculate total
    const totalResult = await db
        .select({
            total: sql<string>`COALESCE(SUM(${srCommissions.amount}), 0)`,
        })
        .from(srCommissions)
        .where(and(...conditions));

    const total = parseFloat(totalResult[0]?.total || "0");

    return {
        commissions,
        total: total.toFixed(2),
        count: commissions.length,
    };
}

/**
 * Delete a commission entry
 */
export async function deleteCommission(id: number) {
    try {
        const result = await db
            .delete(srCommissions)
            .where(eq(srCommissions.id, id))
            .returning({ id: srCommissions.id });

        if (result.length === 0) {
            return { success: false, message: "Commission not found" };
        }

        return { success: true, message: "Commission deleted successfully" };
    } catch (error) {
        logError("Error deleting SR commission:", error);
        return { success: false, message: "Failed to delete commission" };
    }
}
