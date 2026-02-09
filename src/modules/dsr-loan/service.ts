import { db } from "../../db/config";
import { dsr, dsrLoanTransactions } from "../../db/schema";
import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import { logError } from "../../lib/error-handler";
import type {
    GetDSRLoanSummaryQuery,
    GetDSRLoanTransactionsQuery,
    CreateLoanInput,
    CreateRepaymentInput,
} from "./validation";
import type { DSRLoanSummary, DSRLoanTransaction, DSRLoanDetails } from "./types";

/**
 * Get all DSRs with their loan summary (totals and current balance)
 */
export async function getDSRLoanSummary(
    query: GetDSRLoanSummaryQuery
): Promise<DSRLoanSummary[]> {
    // Get all DSRs
    let dsrQuery = db.select().from(dsr);

    // Get all DSRs first
    const allDsrs = await dsrQuery;

    // For each DSR, calculate their loan summary
    const summaries: DSRLoanSummary[] = [];

    for (const dsrRecord of allDsrs) {
        // Apply search filter if provided
        if (query.search && !dsrRecord.name.toLowerCase().includes(query.search.toLowerCase())) {
            continue;
        }

        // Get transaction totals for this DSR
        const totals = await db
            .select({
                totalLoans: sql<string>`COALESCE(SUM(CASE WHEN ${dsrLoanTransactions.transactionType} = 'loan' THEN ${dsrLoanTransactions.amount} ELSE 0 END), 0)`,
                totalRepayments: sql<string>`COALESCE(SUM(CASE WHEN ${dsrLoanTransactions.transactionType} = 'repayment' THEN ${dsrLoanTransactions.amount} ELSE 0 END), 0)`,
                transactionCount: sql<number>`COUNT(*)::int`,
                lastTransactionDate: sql<string | null>`MAX(${dsrLoanTransactions.transactionDate})`,
            })
            .from(dsrLoanTransactions)
            .where(eq(dsrLoanTransactions.dsrId, dsrRecord.id));

        const total = totals[0];
        const loans = parseFloat(total?.totalLoans || "0");
        const repayments = parseFloat(total?.totalRepayments || "0");

        summaries.push({
            dsrId: dsrRecord.id,
            dsrName: dsrRecord.name,
            totalLoans: loans.toFixed(2),
            totalRepayments: repayments.toFixed(2),
            currentBalance: (loans - repayments).toFixed(2),
            transactionCount: total?.transactionCount || 0,
            lastTransactionDate: total?.lastTransactionDate || null,
        });
    }

    // Sort by current balance (highest first)
    summaries.sort((a, b) => parseFloat(b.currentBalance) - parseFloat(a.currentBalance));

    return summaries;
}

/**
 * Get detailed loan info for a specific DSR
 */
export async function getDSRLoanDetails(dsrId: number): Promise<DSRLoanDetails | null> {
    // Get DSR info
    const dsrRecord = await db
        .select()
        .from(dsr)
        .where(eq(dsr.id, dsrId))
        .limit(1);

    if (dsrRecord.length === 0) {
        return null;
    }

    // Get transaction totals
    const totals = await db
        .select({
            totalLoans: sql<string>`COALESCE(SUM(CASE WHEN ${dsrLoanTransactions.transactionType} = 'loan' THEN ${dsrLoanTransactions.amount} ELSE 0 END), 0)`,
            totalRepayments: sql<string>`COALESCE(SUM(CASE WHEN ${dsrLoanTransactions.transactionType} = 'repayment' THEN ${dsrLoanTransactions.amount} ELSE 0 END), 0)`,
        })
        .from(dsrLoanTransactions)
        .where(eq(dsrLoanTransactions.dsrId, dsrId));

    const total = totals[0];
    const loans = parseFloat(total?.totalLoans || "0");
    const repayments = parseFloat(total?.totalRepayments || "0");

    // Get all transactions
    const transactions = await db
        .select({
            id: dsrLoanTransactions.id,
            dsrId: dsrLoanTransactions.dsrId,
            transactionType: dsrLoanTransactions.transactionType,
            amount: dsrLoanTransactions.amount,
            transactionDate: dsrLoanTransactions.transactionDate,
            paymentMethod: dsrLoanTransactions.paymentMethod,
            note: dsrLoanTransactions.note,
            referenceNumber: dsrLoanTransactions.referenceNumber,
            createdAt: dsrLoanTransactions.createdAt,
        })
        .from(dsrLoanTransactions)
        .where(eq(dsrLoanTransactions.dsrId, dsrId))
        .orderBy(desc(dsrLoanTransactions.transactionDate), desc(dsrLoanTransactions.createdAt));

    return {
        dsr: {
            id: dsrRecord[0]!.id,
            name: dsrRecord[0]!.name,
        },
        summary: {
            totalLoans: loans.toFixed(2),
            totalRepayments: repayments.toFixed(2),
            currentBalance: (loans - repayments).toFixed(2),
        },
        transactions: transactions.map(t => ({
            id: t.id,
            dsrId: t.dsrId,
            dsrName: dsrRecord[0]!.name,
            transactionType: t.transactionType as "loan" | "repayment",
            amount: t.amount,
            transactionDate: t.transactionDate,
            paymentMethod: t.paymentMethod,
            note: t.note,
            referenceNumber: t.referenceNumber,
            createdAt: t.createdAt?.toISOString() || new Date().toISOString(),
        })),
    };
}

/**
 * Get transaction history for a DSR with optional filters
 */
export async function getDSRLoanTransactions(
    query: GetDSRLoanTransactionsQuery
): Promise<DSRLoanTransaction[]> {
    const conditions = [eq(dsrLoanTransactions.dsrId, query.dsrId)];

    if (query.startDate) {
        conditions.push(gte(dsrLoanTransactions.transactionDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(dsrLoanTransactions.transactionDate, query.endDate));
    }
    if (query.transactionType) {
        conditions.push(eq(dsrLoanTransactions.transactionType, query.transactionType));
    }

    // Get DSR name
    const dsrRecord = await db
        .select({ name: dsr.name })
        .from(dsr)
        .where(eq(dsr.id, query.dsrId))
        .limit(1);

    const dsrName = dsrRecord[0]?.name || "Unknown";

    const transactions = await db
        .select()
        .from(dsrLoanTransactions)
        .where(and(...conditions))
        .orderBy(desc(dsrLoanTransactions.transactionDate), desc(dsrLoanTransactions.createdAt));

    return transactions.map(t => ({
        id: t.id,
        dsrId: t.dsrId,
        dsrName,
        transactionType: t.transactionType as "loan" | "repayment",
        amount: t.amount,
        transactionDate: t.transactionDate,
        paymentMethod: t.paymentMethod,
        note: t.note,
        referenceNumber: t.referenceNumber,
        createdAt: t.createdAt?.toISOString() || new Date().toISOString(),
    }));
}

/**
 * Create a loan transaction (DSR takes money from company)
 */
export async function createLoan(input: CreateLoanInput): Promise<{ success: boolean; message: string; transactionId?: number }> {
    try {
        // Verify DSR exists
        const dsrRecord = await db
            .select()
            .from(dsr)
            .where(eq(dsr.id, input.dsrId))
            .limit(1);

        if (dsrRecord.length === 0) {
            return { success: false, message: "DSR not found" };
        }

        // Create the loan transaction
        const result = await db
            .insert(dsrLoanTransactions)
            .values({
                dsrId: input.dsrId,
                transactionType: "loan",
                amount: input.amount.toString(),
                transactionDate: input.transactionDate,
                paymentMethod: input.paymentMethod || null,
                note: input.note || null,
                referenceNumber: input.referenceNumber || null,
            })
            .returning({ id: dsrLoanTransactions.id });

        return {
            success: true,
            message: "Loan recorded successfully",
            transactionId: result[0]!.id,
        };
    } catch (error) {
        logError("Error creating loan:", error);
        return { success: false, message: "Failed to record loan" };
    }
}

/**
 * Create a repayment transaction (DSR pays back to company)
 */
export async function createRepayment(input: CreateRepaymentInput): Promise<{ success: boolean; message: string; transactionId?: number }> {
    try {
        // Verify DSR exists
        const dsrRecord = await db
            .select()
            .from(dsr)
            .where(eq(dsr.id, input.dsrId))
            .limit(1);

        if (dsrRecord.length === 0) {
            return { success: false, message: "DSR not found" };
        }

        // Create the repayment transaction
        const result = await db
            .insert(dsrLoanTransactions)
            .values({
                dsrId: input.dsrId,
                transactionType: "repayment",
                amount: input.amount.toString(),
                transactionDate: input.transactionDate,
                paymentMethod: input.paymentMethod || null,
                note: input.note || null,
                referenceNumber: input.referenceNumber || null,
            })
            .returning({ id: dsrLoanTransactions.id });

        return {
            success: true,
            message: "Repayment recorded successfully",
            transactionId: result[0]!.id,
        };
    } catch (error) {
        logError("Error creating repayment:", error);
        return { success: false, message: "Failed to record repayment" };
    }
}

/**
 * Delete a transaction (for corrections)
 */
export async function deleteTransaction(transactionId: number): Promise<{ success: boolean; message: string }> {
    try {
        const result = await db
            .delete(dsrLoanTransactions)
            .where(eq(dsrLoanTransactions.id, transactionId))
            .returning({ id: dsrLoanTransactions.id });

        if (result.length === 0) {
            return { success: false, message: "Transaction not found" };
        }

        return { success: true, message: "Transaction deleted successfully" };
    } catch (error) {
        logError("Error deleting transaction:", error);
        return { success: false, message: "Failed to delete transaction" };
    }
}
