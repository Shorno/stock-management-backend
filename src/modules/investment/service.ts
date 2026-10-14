import { db } from "../../db/config";
import { investments, investmentWithdrawals } from "../../db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { logError } from "../../lib/error-handler";
import { getOpeningBalanceTotals } from "../opening-balance/service";
import { getPlAdjustmentNetEffects } from "../pl-adjustments/service";
import type {
    GetInvestmentsQuery,
    CreateInvestmentInput,
    CreateWithdrawalInput
} from "./validation";

export interface Investment {
    id: number;
    amount: string;
    investmentDate: string;
    note: string | null;
    createdAt: string;
}

export interface InvestmentWithdrawal {
    id: number;
    amount: string;
    withdrawalDate: string;
    note: string | null;
    createdAt: string;
}

/**
 * Get all investments with optional date filter
 */
export async function getInvestments(query?: GetInvestmentsQuery): Promise<Investment[]> {
    const conditions = [];

    if (query?.startDate) {
        conditions.push(gte(investments.investmentDate, query.startDate));
    }
    if (query?.endDate) {
        conditions.push(lte(investments.investmentDate, query.endDate));
    }

    const results = await db
        .select()
        .from(investments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(investments.investmentDate), desc(investments.createdAt));

    return results.map(r => ({
        id: r.id,
        amount: r.amount,
        investmentDate: r.investmentDate,
        note: r.note,
        createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
    }));
}

/**
 * Get all investment withdrawals with optional date filter
 */
export async function getWithdrawals(query?: GetInvestmentsQuery): Promise<InvestmentWithdrawal[]> {
    const conditions = [];

    if (query?.startDate) {
        conditions.push(gte(investmentWithdrawals.withdrawalDate, query.startDate));
    }
    if (query?.endDate) {
        conditions.push(lte(investmentWithdrawals.withdrawalDate, query.endDate));
    }

    const results = await db
        .select()
        .from(investmentWithdrawals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(investmentWithdrawals.withdrawalDate), desc(investmentWithdrawals.createdAt));

    return results.map(r => ({
        id: r.id,
        amount: r.amount,
        withdrawalDate: r.withdrawalDate,
        note: r.note,
        createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
    }));
}

/**
 * Create an investment (deposit)
 */
export async function createInvestment(input: CreateInvestmentInput): Promise<{ success: boolean; message: string; investmentId?: number }> {
    try {
        const result = await db
            .insert(investments)
            .values({
                amount: input.amount.toString(),
                investmentDate: input.investmentDate,
                note: input.note || null,
            })
            .returning({ id: investments.id });

        return {
            success: true,
            message: "Investment recorded successfully",
            investmentId: result[0]!.id,
        };
    } catch (error) {
        logError("Error creating investment:", error);
        return { success: false, message: "Failed to record investment" };
    }
}

/**
 * Create a withdrawal from investment
 */
export async function createWithdrawal(input: CreateWithdrawalInput): Promise<{ success: boolean; message: string; withdrawalId?: number }> {
    try {
        // Get current investment balance
        const balance = await getInvestmentBalance();

        // Validate that withdrawal doesn't exceed available balance
        if (input.amount > balance) {
            return {
                success: false,
                message: `Insufficient investment balance. Available: ৳${balance.toLocaleString("en-BD", { minimumFractionDigits: 2 })}, Requested: ৳${input.amount.toLocaleString("en-BD", { minimumFractionDigits: 2 })}`,
            };
        }

        const result = await db
            .insert(investmentWithdrawals)
            .values({
                amount: input.amount.toString(),
                withdrawalDate: input.withdrawalDate,
                note: input.note || null,
            })
            .returning({ id: investmentWithdrawals.id });

        return {
            success: true,
            message: "Withdrawal recorded successfully",
            withdrawalId: result[0]!.id,
        };
    } catch (error) {
        logError("Error creating withdrawal:", error);
        return { success: false, message: "Failed to record withdrawal" };
    }
}

/**
 * Delete an investment
 */
export async function deleteInvestment(investmentId: number): Promise<{ success: boolean; message: string }> {
    try {
        const result = await db
            .delete(investments)
            .where(eq(investments.id, investmentId))
            .returning({ id: investments.id });

        if (result.length === 0) {
            return { success: false, message: "Investment not found" };
        }

        return { success: true, message: "Investment deleted successfully" };
    } catch (error) {
        logError("Error deleting investment:", error);
        return { success: false, message: "Failed to delete investment" };
    }
}

/**
 * Delete a withdrawal
 */
export async function deleteWithdrawal(withdrawalId: number): Promise<{ success: boolean; message: string }> {
    try {
        const result = await db
            .delete(investmentWithdrawals)
            .where(eq(investmentWithdrawals.id, withdrawalId))
            .returning({ id: investmentWithdrawals.id });

        if (result.length === 0) {
            return { success: false, message: "Withdrawal not found" };
        }

        return { success: true, message: "Withdrawal deleted successfully" };
    } catch (error) {
        logError("Error deleting withdrawal:", error);
        return { success: false, message: "Failed to delete withdrawal" };
    }
}

/**
 * Get total investments for a date range
 */
export async function getTotalInvestments(startDate?: string, endDate?: string): Promise<string> {
    const conditions = [];

    if (startDate) {
        conditions.push(gte(investments.investmentDate, startDate));
    }
    if (endDate) {
        conditions.push(lte(investments.investmentDate, endDate));
    }

    const results = await db
        .select({ amount: investments.amount })
        .from(investments)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = results.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    return total.toFixed(2);
}

/**
 * Get total withdrawals for a date range
 */
export async function getTotalWithdrawals(startDate?: string, endDate?: string): Promise<string> {
    const conditions = [];

    if (startDate) {
        conditions.push(gte(investmentWithdrawals.withdrawalDate, startDate));
    }
    if (endDate) {
        conditions.push(lte(investmentWithdrawals.withdrawalDate, endDate));
    }

    const results = await db
        .select({ amount: investmentWithdrawals.amount })
        .from(investmentWithdrawals)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = results.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    return total.toFixed(2);
}

/**
 * Get current investment balance (opening investment + total investments - total withdrawals)
 */
export async function getInvestmentBalance(): Promise<number> {
    const totalInvestments = await getTotalInvestments();
    const totalWithdrawals = await getTotalWithdrawals();
    const openingInvestment = (await getOpeningBalanceTotals()).get("investment") || 0;

    return openingInvestment + parseFloat(totalInvestments) - parseFloat(totalWithdrawals);
}

export interface InvestmentDifference {
    netAssets: number;
    investmentBalance: number;
    profitLoss: number;
    // Older profit-only P&L adjustments (income − expense), left out of the difference
    profitOnlyAdjustments: number;
    difference: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100 || 0;

/**
 * Difference = Net Assets − (Investment Balance + Profit).
 * Positive: more money came into the business than is recorded as investment.
 * Negative: money was taken out (e.g. cash withdrawn) and not put back.
 * Older profit-only P&L adjustments never reached net assets, so they are left out of
 * the profit here; otherwise they would show as a gap no real transaction explains.
 */
export function calculateInvestmentDifference(input: Omit<InvestmentDifference, "difference">): InvestmentDifference {
    const profit = input.profitLoss - input.profitOnlyAdjustments;
    return {
        netAssets: roundMoney(input.netAssets),
        investmentBalance: roundMoney(input.investmentBalance),
        profitLoss: roundMoney(input.profitLoss),
        profitOnlyAdjustments: roundMoney(input.profitOnlyAdjustments),
        difference: roundMoney(input.netAssets - (input.investmentBalance + profit)),
    };
}

/**
 * All-time investment difference as of today. Never date filtered: net assets are a
 * running balance and cannot be rebuilt for a past date.
 */
export async function getInvestmentDifference(): Promise<InvestmentDifference> {
    const { getDashboardStats } = await import("../analytics/service");
    const [stats, investmentBalance, plEffects] = await Promise.all([
        getDashboardStats(),
        getInvestmentBalance(),
        getPlAdjustmentNetEffects(),
    ]);
    return calculateInvestmentDifference({
        netAssets: stats.netAssets,
        investmentBalance,
        profitLoss: stats.profitLoss,
        profitOnlyAdjustments: plEffects.profitOnly,
    });
}
