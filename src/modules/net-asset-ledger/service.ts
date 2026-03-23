import { db } from "../../db/config";
import { netAssetLedger, type NewNetAssetLedgerEntry } from "../../db/schema/net-asset-ledger-schema";
import { desc, and, gte, lte, sql, count } from "drizzle-orm";

// ==================== RECORD ENTRY ====================

export interface RecordLedgerEntryInput {
    transactionType: string;
    description: string;
    amount: number;
    netAssetChange: number; // positive = increase, negative = decrease, 0 = neutral/internal transfer
    affectedComponent: string;
    entityType?: string;
    entityId?: number;
    transactionDate: string; // YYYY-MM-DD
}

/**
 * Record a single entry in the net asset ledger.
 * Call this from each transaction handler (bills, withdrawals, orders, etc.)
 */
export async function recordEntry(input: RecordLedgerEntryInput): Promise<void> {
    try {
        await db.insert(netAssetLedger).values({
            transactionType: input.transactionType,
            description: input.description,
            amount: input.amount.toFixed(2),
            netAssetChange: input.netAssetChange.toFixed(2),
            affectedComponent: input.affectedComponent,
            entityType: input.entityType || null,
            entityId: input.entityId || null,
            transactionDate: input.transactionDate,
        });
    } catch (error) {
        // Don't let ledger failures break the main transaction
        console.error("[NetAssetLedger] Failed to record entry:", error);
    }
}

// ==================== GET LEDGER ====================

export interface LedgerQuery {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    transactionType?: string;
}

export interface LedgerEntryResult {
    id: number;
    transactionType: string;
    description: string;
    amount: string;
    netAssetChange: string;
    affectedComponent: string;
    entityType: string | null;
    entityId: number | null;
    transactionDate: string;
    createdAt: Date;
}

export interface LedgerResponse {
    entries: LedgerEntryResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    currentNetAssets: number;
}

/**
 * Get ledger entries (transaction log) along with the LIVE current net assets
 * from the analytics snapshot. The running balance is NOT computed per-row because
 * net assets depend on complex multi-component calculations (stock at cost, dues,
 * cash balance, damage values, pending orders) that can't be accurately derived
 * from incremental per-transaction changes.
 */
export async function getLedger(query: LedgerQuery = {}): Promise<LedgerResponse> {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const offset = (page - 1) * limit;

    // Build filters
    const filters = [];
    if (query.startDate) {
        filters.push(gte(netAssetLedger.transactionDate, query.startDate));
    }
    if (query.endDate) {
        filters.push(lte(netAssetLedger.transactionDate, query.endDate));
    }
    if (query.transactionType) {
        filters.push(sql`${netAssetLedger.transactionType} = ${query.transactionType}`);
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    // Get total count
    const countResult = await db
        .select({ total: count() })
        .from(netAssetLedger)
        .where(whereClause);
    const total = Number(countResult[0]?.total || 0);

    // Get entries
    let entries: LedgerEntryResult[] = [];
    if (total > 0) {
        entries = await db
            .select({
                id: netAssetLedger.id,
                transactionType: netAssetLedger.transactionType,
                description: netAssetLedger.description,
                amount: netAssetLedger.amount,
                netAssetChange: netAssetLedger.netAssetChange,
                affectedComponent: netAssetLedger.affectedComponent,
                entityType: netAssetLedger.entityType,
                entityId: netAssetLedger.entityId,
                transactionDate: netAssetLedger.transactionDate,
                createdAt: netAssetLedger.createdAt,
            })
            .from(netAssetLedger)
            .where(whereClause)
            .orderBy(desc(netAssetLedger.transactionDate), desc(netAssetLedger.id))
            .limit(limit)
            .offset(offset);
    }

    // Get LIVE current net assets from the analytics service
    let currentNetAssets = 0;
    try {
        const { getDashboardStats } = await import("../analytics/service");
        const analytics = await getDashboardStats();
        currentNetAssets = analytics.netAssets;
    } catch (error) {
        console.error("[NetAssetLedger] Failed to fetch current net assets:", error);
    }

    return {
        entries,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        currentNetAssets,
    };
}

// ==================== BACKFILL ====================

/**
 * Backfill ledger from existing transaction data.
 * Clears the ledger table first, then reconstructs from all historical transactions.
 * Each entry is tagged with the component it affects and its net asset impact direction.
 */
export async function backfillLedger(): Promise<{ entriesCreated: number }> {
    // Clear existing entries
    await db.delete(netAssetLedger);

    const allEntries: NewNetAssetLedgerEntry[] = [];

    // ----- 1. Order Settlements (wholesale orders that are not pending/cancelled) -----
    const { wholesaleOrders, orderPayments, orderExpenses, orderItemReturns, orderCustomerDues, orderDsrDues, orderSrDues, orderDamageItems } = await import("../../db/schema/wholesale-schema");
    const { ne } = await import("drizzle-orm");

    const orders = await db.query.wholesaleOrders.findMany({
        where: and(ne(wholesaleOrders.status, "cancelled"), ne(wholesaleOrders.status, "pending")),
    });

    for (const order of orders) {
        const orderDate = order.orderDate;

        // Payments (cash received)
        const payments = await db
            .select({ total: sql<string>`COALESCE(SUM(CAST(${orderPayments.amount} AS DECIMAL)), 0)` })
            .from(orderPayments)
            .where(sql`${orderPayments.orderId} = ${order.id}`);
        const totalPayments = Number(payments[0]?.total || 0);

        if (totalPayments > 0) {
            allEntries.push({
                transactionType: "order_payment",
                description: `Payment received for Order #${order.orderNumber} — ৳${totalPayments.toLocaleString()}`,
                amount: totalPayments.toFixed(2),
                netAssetChange: totalPayments.toFixed(2), // Cash increases net assets
                affectedComponent: "cash",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }

        // Customer dues created
        const customerDues = await db
            .select({ total: sql<string>`COALESCE(SUM(CAST(${orderCustomerDues.amount} AS DECIMAL)), 0)` })
            .from(orderCustomerDues)
            .where(sql`${orderCustomerDues.orderId} = ${order.id}`);
        const totalCustomerDues = Number(customerDues[0]?.total || 0);

        if (totalCustomerDues > 0) {
            allEntries.push({
                transactionType: "customer_due_created",
                description: `Customer due created for Order #${order.orderNumber} — ৳${totalCustomerDues.toLocaleString()}`,
                amount: totalCustomerDues.toFixed(2),
                netAssetChange: totalCustomerDues.toFixed(2), // Customer dues are receivables → increase net assets
                affectedComponent: "customerDue",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }

        // DSR dues
        const dsrDues = await db
            .select({ total: sql<string>`COALESCE(SUM(CAST(${orderDsrDues.amount} AS DECIMAL)), 0)` })
            .from(orderDsrDues)
            .where(sql`${orderDsrDues.orderId} = ${order.id}`);
        const totalDsrDues = Number(dsrDues[0]?.total || 0);

        if (totalDsrDues > 0) {
            allEntries.push({
                transactionType: "dsr_due_created",
                description: `DSR due created for Order #${order.orderNumber} — ৳${totalDsrDues.toLocaleString()}`,
                amount: totalDsrDues.toFixed(2),
                netAssetChange: totalDsrDues.toFixed(2), // DSR receivables → increase net assets
                affectedComponent: "dsrDue",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }

        // SR dues
        const srDues = await db
            .select({ total: sql<string>`COALESCE(SUM(CAST(${orderSrDues.amount} AS DECIMAL)), 0)` })
            .from(orderSrDues)
            .where(sql`${orderSrDues.orderId} = ${order.id}`);
        const totalSrDues = Number(srDues[0]?.total || 0);

        if (totalSrDues > 0) {
            allEntries.push({
                transactionType: "sr_due_created",
                description: `SR due created for Order #${order.orderNumber} — ৳${totalSrDues.toLocaleString()}`,
                amount: totalSrDues.toFixed(2),
                netAssetChange: totalSrDues.toFixed(2), // SR receivables → increase net assets
                affectedComponent: "srDue",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }

        // Expenses (decrease cash balance → decrease net assets)
        const expenses = await db
            .select({ total: sql<string>`COALESCE(SUM(CAST(${orderExpenses.amount} AS DECIMAL)), 0)` })
            .from(orderExpenses)
            .where(sql`${orderExpenses.orderId} = ${order.id}`);
        const totalExpenses = Number(expenses[0]?.total || 0);

        if (totalExpenses > 0) {
            allEntries.push({
                transactionType: "order_expense",
                description: `Expense for Order #${order.orderNumber} — ৳${totalExpenses.toLocaleString()}`,
                amount: totalExpenses.toFixed(2),
                netAssetChange: (-totalExpenses).toFixed(2),
                affectedComponent: "cash",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }

        // Returns (increase stock, decrease cash/dues → need to track net impact)
        const returns = await db
            .select({
                totalReturn: sql<string>`COALESCE(SUM(CAST(${orderItemReturns.returnAmount} AS DECIMAL)), 0)`,
                totalDiscount: sql<string>`COALESCE(SUM(CAST(${orderItemReturns.adjustmentDiscount} AS DECIMAL)), 0)`,
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} = ${order.id}`);
        const totalReturnAmount = Number(returns[0]?.totalReturn || 0);
        const totalReturnDiscount = Number(returns[0]?.totalDiscount || 0);

        if (totalReturnAmount > 0 || totalReturnDiscount > 0) {
            const totalReturns = totalReturnAmount + totalReturnDiscount;
            allEntries.push({
                transactionType: "item_return",
                description: `Item returns for Order #${order.orderNumber} — ৳${totalReturns.toLocaleString()}`,
                amount: totalReturns.toFixed(2),
                netAssetChange: (-totalReturns).toFixed(2), // Returns reduce what was received → decrease net assets
                affectedComponent: "cash",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }

        // Damage items (at cost price, since that's what the analytics tracks)
        const damages = await db
            .select({
                totalDamageCost: sql<string>`COALESCE(SUM(CAST(${orderDamageItems.unitPrice} AS DECIMAL) * ${orderDamageItems.quantity}), 0)`,
            })
            .from(orderDamageItems)
            .where(sql`${orderDamageItems.orderId} = ${order.id}`);
        const totalDamageCost = Number(damages[0]?.totalDamageCost || 0);

        if (totalDamageCost > 0) {
            allEntries.push({
                transactionType: "damage_item",
                description: `Damage items for Order #${order.orderNumber} — ৳${totalDamageCost.toLocaleString()} (at cost)`,
                amount: totalDamageCost.toFixed(2),
                netAssetChange: totalDamageCost.toFixed(2), // Damage items at cost are tracked as an asset
                affectedComponent: "damageReturns",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }

        // Stock cost deducted (the cost of goods sold for this order)
        // This is the key missing piece — when stock is sold, currentStock decreases
        const { stockBatch } = await import("../../db/schema/product-schema");
        const { wholesaleOrderItems } = await import("../../db/schema/wholesale-schema");

        const itemsResult = await db
            .select({
                supplierPrice: stockBatch.supplierPrice,
                totalQuantity: wholesaleOrderItems.totalQuantity,
                itemId: wholesaleOrderItems.id,
            })
            .from(wholesaleOrderItems)
            .innerJoin(stockBatch, sql`${wholesaleOrderItems.batchId} = ${stockBatch.id}`)
            .where(sql`${wholesaleOrderItems.orderId} = ${order.id}`);

        // Get returns map for this order
        const returnsForCost = await db
            .select({
                orderItemId: orderItemReturns.orderItemId,
                returnQuantity: orderItemReturns.returnQuantity,
                returnExtraPieces: sql<number>`COALESCE(${orderItemReturns.returnExtraPieces}, 0)`,
            })
            .from(orderItemReturns)
            .where(sql`${orderItemReturns.orderId} = ${order.id}`);

        const returnQtyMap = new Map<number, number>();
        for (const ret of returnsForCost) {
            returnQtyMap.set(ret.orderItemId, ret.returnQuantity + Number(ret.returnExtraPieces || 0));
        }

        let orderCOGS = 0;
        for (const item of itemsResult) {
            const supplierPrice = Number(item.supplierPrice || 0);
            const qty = item.totalQuantity || 0;
            const returnQty = returnQtyMap.get(item.itemId) || 0;
            const netQty = qty - returnQty;
            orderCOGS += supplierPrice * netQty;
        }

        if (orderCOGS > 0) {
            allEntries.push({
                transactionType: "stock_sold",
                description: `Stock sold for Order #${order.orderNumber} — cost ৳${orderCOGS.toLocaleString()}`,
                amount: orderCOGS.toFixed(2),
                netAssetChange: (-orderCOGS).toFixed(2), // Stock decreases → net asset decreases
                affectedComponent: "stock",
                entityType: "order",
                entityId: order.id,
                transactionDate: orderDate,
            });
        }
    }

    // ----- 2. Bills -----
    const { bills } = await import("../../db/schema/bills-schema");
    const billsList = await db.select().from(bills);
    for (const bill of billsList) {
        const amount = Number(bill.amount);
        allEntries.push({
            transactionType: "bill",
            description: `Bill: ${bill.title} — ৳${amount.toLocaleString()}`,
            amount: amount.toFixed(2),
            netAssetChange: (-amount).toFixed(2),
            affectedComponent: "cash",
            entityType: "bill",
            entityId: bill.id,
            transactionDate: bill.billDate,
        });
    }

    // ----- 3. Cash Withdrawals -----
    const { cashWithdrawals } = await import("../../db/schema");
    const withdrawals = await db.select().from(cashWithdrawals);
    for (const w of withdrawals) {
        const amount = Number(w.amount);
        allEntries.push({
            transactionType: "cash_withdrawal",
            description: `Cash withdrawal — ৳${amount.toLocaleString()}${w.note ? ` (${w.note})` : ""}`,
            amount: amount.toFixed(2),
            netAssetChange: (-amount).toFixed(2),
            affectedComponent: "cash",
            entityType: "cash_withdrawal",
            entityId: w.id,
            transactionDate: w.withdrawalDate,
        });
    }

    // ----- 4. Supplier Purchases (stock ↑, supplierDue ↓ → purchase adds stock but increases what we owe) -----
    const { supplierPurchases, supplierPayments: supplierPaymentsTable } = await import("../../db/schema/supplier-schema");
    const { brand } = await import("../../db/schema/product-schema");

    const purchases = await db
        .select({ purchase: supplierPurchases, brandName: brand.name })
        .from(supplierPurchases)
        .leftJoin(brand, sql`${supplierPurchases.brandId} = ${brand.id}`);

    for (const { purchase, brandName } of purchases) {
        const amount = Number(purchase.amount);
        // Supplier purchase: stock ↑ by amount, supplierDue ↓ by amount → net 0 on net assets
        // (because the formula includes both currentStock and supplierDue)
        allEntries.push({
            transactionType: "supplier_purchase",
            description: `Supplier purchase from ${brandName || "Unknown"} — ৳${amount.toLocaleString()}`,
            amount: amount.toFixed(2),
            netAssetChange: "0",
            affectedComponent: "supplierDue",
            entityType: "supplier_purchase",
            entityId: purchase.id,
            transactionDate: purchase.purchaseDate,
        });
    }

    // ----- 5. Supplier Payments (cash ↓ if from cash, supplierDue ↑ → net 0 on net assets) -----
    const supplierPaymentsList = await db
        .select({ payment: supplierPaymentsTable, brandName: brand.name })
        .from(supplierPaymentsTable)
        .leftJoin(brand, sql`${supplierPaymentsTable.brandId} = ${brand.id}`);

    for (const { payment, brandName } of supplierPaymentsList) {
        const amount = Number(payment.amount);
        const fromCash = payment.fromCashBalance;
        allEntries.push({
            transactionType: "supplier_payment",
            description: `Supplier payment to ${brandName || "Unknown"} — ৳${amount.toLocaleString()}${fromCash ? " (from cash)" : ""}`,
            amount: amount.toFixed(2),
            netAssetChange: "0", // cash ↓, supplierDue ↑ → symmetrical
            affectedComponent: fromCash ? "cash" : "supplierDue",
            entityType: "supplier_payment",
            entityId: payment.id,
            transactionDate: payment.paymentDate,
        });
    }

    // ----- 6. Due Collections (Customer) — cash ↑, customerDue ↓ → net 0 -----
    const { dueCollections } = await import("../../db/schema/wholesale-schema");
    const customerCollections = await db.select().from(dueCollections);
    for (const c of customerCollections) {
        const amount = Number(c.amount);
        allEntries.push({
            transactionType: "due_collection_customer",
            description: `Customer due collected — ৳${amount.toLocaleString()}`,
            amount: amount.toFixed(2),
            netAssetChange: "0",
            affectedComponent: "cash",
            entityType: "due_collection",
            entityId: c.id,
            transactionDate: c.collectionDate,
        });
    }

    // ----- 7. Due Collections (DSR) -----
    const { dsrDueCollections } = await import("../../db/schema/wholesale-schema");
    const dsrCollections = await db.select().from(dsrDueCollections);
    for (const c of dsrCollections) {
        const amount = Number(c.amount);
        allEntries.push({
            transactionType: "due_collection_dsr",
            description: `DSR due collected — ৳${amount.toLocaleString()}`,
            amount: amount.toFixed(2),
            netAssetChange: "0",
            affectedComponent: "cash",
            entityType: "dsr_due_collection",
            entityId: c.id,
            transactionDate: c.collectionDate,
        });
    }

    // ----- 8. Due Collections (SR) -----
    const { srDueCollections } = await import("../../db/schema/wholesale-schema");
    const srCollections = await db.select().from(srDueCollections);
    for (const c of srCollections) {
        const amount = Number(c.amount);
        allEntries.push({
            transactionType: "due_collection_sr",
            description: `SR due collected — ৳${amount.toLocaleString()}`,
            amount: amount.toFixed(2),
            netAssetChange: "0",
            affectedComponent: "cash",
            entityType: "sr_due_collection",
            entityId: c.id,
            transactionDate: c.collectionDate,
        });
    }

    // ----- 9. DSR Loans -----
    const { dsrLoanTransactions } = await import("../../db/schema/wholesale-schema");
    const loans = await db.select().from(dsrLoanTransactions);
    for (const loan of loans) {
        const amount = Number(loan.amount);
        const isGiven = loan.transactionType === "given";
        allEntries.push({
            transactionType: isGiven ? "dsr_loan_given" : "dsr_loan_repaid",
            description: `DSR loan ${isGiven ? "given" : "repaid"} — ৳${amount.toLocaleString()}`,
            amount: amount.toFixed(2),
            netAssetChange: "0", // cash ↕, dsrDue ↕ → neutral
            affectedComponent: "dsrDue",
            entityType: "dsr_loan",
            entityId: loan.id,
            transactionDate: loan.transactionDate,
        });
    }

    // ----- 10. Stock Adjustments (damage/loss) -----
    const { stockAdjustments, stockBatch: stockBatchTable } = await import("../../db/schema/product-schema");
    const adjustments = await db
        .select({ adj: stockAdjustments, supplierPrice: stockBatchTable.supplierPrice })
        .from(stockAdjustments)
        .leftJoin(stockBatchTable, sql`${stockAdjustments.batchId} = ${stockBatchTable.id}`);

    for (const { adj, supplierPrice } of adjustments) {
        const costPerUnit = Number(supplierPrice || 0);
        const qty = adj.quantity;
        const totalCost = costPerUnit * qty;
        const isDamage = adj.adjustmentType === "damage";

        allEntries.push({
            transactionType: "stock_adjustment",
            description: `Stock ${adj.adjustmentType}: ${qty} units${adj.note ? ` — ${adj.note}` : ""}`,
            amount: totalCost.toFixed(2),
            netAssetChange: isDamage ? (-totalCost).toFixed(2) : totalCost.toFixed(2),
            affectedComponent: "stock",
            entityType: "stock_adjustment",
            entityId: adj.id,
            transactionDate: (adj.createdAt ? adj.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]) as string,
        });
    }

    // ----- 11. P&L Adjustments -----
    const { plAdjustments } = await import("../../db/schema/pl-adjustment-schema");
    const plAdj = await db.select().from(plAdjustments);
    for (const adj of plAdj) {
        const amount = Number(adj.amount);
        allEntries.push({
            transactionType: "pl_adjustment",
            description: `P&L Adjustment (${adj.type}): ${adj.title} — ৳${amount.toLocaleString()}`,
            amount: amount.toFixed(2),
            netAssetChange: "0", // P&L adjustments affect profit display but not net asset components directly
            affectedComponent: "profitLoss",
            entityType: "pl_adjustment",
            entityId: adj.id,
            transactionDate: adj.adjustmentDate,
        });
    }

    // ----- 12. Investments -----
    const { investments } = await import("../../db/schema/investment-schema");
    const investmentsList = await db.select().from(investments);
    for (const inv of investmentsList) {
        const amount = Number(inv.amount);
        allEntries.push({
            transactionType: "investment",
            description: `Investment — ৳${amount.toLocaleString()}${inv.note ? ` (${inv.note})` : ""}`,
            amount: amount.toFixed(2),
            netAssetChange: "0",
            affectedComponent: "investment",
            entityType: "investment",
            entityId: inv.id,
            transactionDate: inv.investmentDate,
        });
    }

    // ----- 13. Investment Withdrawals -----
    const { investmentWithdrawals } = await import("../../db/schema/investment-schema");
    const invWithdrawals = await db.select().from(investmentWithdrawals);
    for (const w of invWithdrawals) {
        const amount = Number(w.amount);
        allEntries.push({
            transactionType: "investment_withdrawal",
            description: `Investment withdrawal — ৳${amount.toLocaleString()}${w.note ? ` (${w.note})` : ""}`,
            amount: amount.toFixed(2),
            netAssetChange: "0",
            affectedComponent: "investment",
            entityType: "investment_withdrawal",
            entityId: w.id,
            transactionDate: w.withdrawalDate,
        });
    }

    // Sort by date then insert in batches
    allEntries.sort((a, b) => {
        const dateA = a.transactionDate as string;
        const dateB = b.transactionDate as string;
        return dateA.localeCompare(dateB);
    });

    for (let i = 0; i < allEntries.length; i += 100) {
        const batch = allEntries.slice(i, i + 100);
        await db.insert(netAssetLedger).values(batch);
    }

    return { entriesCreated: allEntries.length };
}

// ==================== LEDGER SUMMARY ====================

export interface LedgerSummary {
    totalIncrease: number;
    totalDecrease: number;
    netChange: number;
    entryCount: number;
    currentNetAssets: number;
}

export async function getLedgerSummary(startDate?: string, endDate?: string): Promise<LedgerSummary> {
    const filters = [];
    if (startDate) filters.push(gte(netAssetLedger.transactionDate, startDate));
    if (endDate) filters.push(lte(netAssetLedger.transactionDate, endDate));

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const result = await db
        .select({
            totalIncrease: sql<string>`COALESCE(SUM(CASE WHEN CAST(${netAssetLedger.netAssetChange} AS DECIMAL) > 0 THEN CAST(${netAssetLedger.netAssetChange} AS DECIMAL) ELSE 0 END), 0)`,
            totalDecrease: sql<string>`COALESCE(SUM(CASE WHEN CAST(${netAssetLedger.netAssetChange} AS DECIMAL) < 0 THEN CAST(${netAssetLedger.netAssetChange} AS DECIMAL) ELSE 0 END), 0)`,
            netChange: sql<string>`COALESCE(SUM(CAST(${netAssetLedger.netAssetChange} AS DECIMAL)), 0)`,
            entryCount: count(),
        })
        .from(netAssetLedger)
        .where(whereClause);

    // Get LIVE current net assets
    let currentNetAssets = 0;
    try {
        const { getDashboardStats } = await import("../analytics/service");
        const analytics = await getDashboardStats();
        currentNetAssets = analytics.netAssets;
    } catch (error) {
        console.error("[NetAssetLedger] Failed to fetch current net assets:", error);
    }

    return {
        totalIncrease: Number(result[0]?.totalIncrease || 0),
        totalDecrease: Math.abs(Number(result[0]?.totalDecrease || 0)),
        netChange: Number(result[0]?.netChange || 0),
        entryCount: Number(result[0]?.entryCount || 0),
        currentNetAssets,
    };
}
