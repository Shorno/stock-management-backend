import { db } from "../../db/config";
import { cashWithdrawals } from "../../db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import type { GetWithdrawalsQuery, CreateWithdrawalInput } from "./validation";

export interface CashWithdrawal {
    id: number;
    amount: string;
    withdrawalDate: string;
    note: string | null;
    createdAt: string;
}

/**
 * Get all cash withdrawals with optional date filter
 */
export async function getWithdrawals(query?: GetWithdrawalsQuery): Promise<CashWithdrawal[]> {
    const conditions = [];

    if (query?.startDate) {
        conditions.push(gte(cashWithdrawals.withdrawalDate, query.startDate));
    }
    if (query?.endDate) {
        conditions.push(lte(cashWithdrawals.withdrawalDate, query.endDate));
    }

    const results = await db
        .select()
        .from(cashWithdrawals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(cashWithdrawals.withdrawalDate), desc(cashWithdrawals.createdAt));

    return results.map(r => ({
        id: r.id,
        amount: r.amount,
        withdrawalDate: r.withdrawalDate,
        note: r.note,
        createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
    }));
}

/**
 * Create a cash withdrawal
 */
export async function createWithdrawal(input: CreateWithdrawalInput): Promise<{ success: boolean; message: string; withdrawalId?: number }> {
    try {
        // Import and check current cash balance
        const { getCurrentCashBalance } = await import("../analytics/service");
        const currentBalance = await getCurrentCashBalance();

        // Validate that withdrawal doesn't exceed available balance
        if (input.amount > currentBalance) {
            return {
                success: false,
                message: `Insufficient cash balance. Available: ৳${currentBalance.toLocaleString("en-BD", { minimumFractionDigits: 2 })}, Requested: ৳${input.amount.toLocaleString("en-BD", { minimumFractionDigits: 2 })}`,
            };
        }

        const result = await db
            .insert(cashWithdrawals)
            .values({
                amount: input.amount.toString(),
                withdrawalDate: input.withdrawalDate,
                note: input.note || null,
            })
            .returning({ id: cashWithdrawals.id });

        return {
            success: true,
            message: "Withdrawal recorded successfully",
            withdrawalId: result[0]!.id,
        };
    } catch (error) {
        console.error("Error creating withdrawal:", error);
        return { success: false, message: "Failed to record withdrawal" };
    }
}


/**
 * Delete a withdrawal
 */
export async function deleteWithdrawal(withdrawalId: number): Promise<{ success: boolean; message: string }> {
    try {
        const result = await db
            .delete(cashWithdrawals)
            .where(eq(cashWithdrawals.id, withdrawalId))
            .returning({ id: cashWithdrawals.id });

        if (result.length === 0) {
            return { success: false, message: "Withdrawal not found" };
        }

        return { success: true, message: "Withdrawal deleted successfully" };
    } catch (error) {
        console.error("Error deleting withdrawal:", error);
        return { success: false, message: "Failed to delete withdrawal" };
    }
}

/**
 * Get total withdrawals for a date range (for reports)
 */
export async function getTotalWithdrawals(startDate?: string, endDate?: string): Promise<string> {
    const conditions = [];

    if (startDate) {
        conditions.push(gte(cashWithdrawals.withdrawalDate, startDate));
    }
    if (endDate) {
        conditions.push(lte(cashWithdrawals.withdrawalDate, endDate));
    }

    const results = await db
        .select({ amount: cashWithdrawals.amount })
        .from(cashWithdrawals)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = results.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    return total.toFixed(2);
}
