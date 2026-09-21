export type ExpenseCommissionSource = "order_expense" | "manual_commission";
export type CommissionOwnerType = "sr" | "db_point";

export interface ExpenseCommissionEntry {
    id: string;
    attributionDate: string;
    source: ExpenseCommissionSource;
    ownerType: CommissionOwnerType;
    srId: number | null;
    srName: string;
    dsrId: number | null;
    dsrName: string | null;
    orderId: number | null;
    orderNumber: string | null;
    routeId: number | null;
    routeName: string | null;
    expenseType: string;
    amount: string;
    note: string | null;
}

export interface ExpenseCommissionSummary {
    totalAmount: string;
    orderExpenseTotal: string;
    srCommissionTotal: string;
    dbPointCommissionTotal: string;
    manualCommissionTotal: string;
    entryCount: number;
    orderCount: number;
}

export function summarizeExpenseCommissionEntries(
    entries: ExpenseCommissionEntry[]
): ExpenseCommissionSummary {
    let orderExpenseTotal = 0;
    let srCommissionTotal = 0;
    let dbPointCommissionTotal = 0;
    let manualCommissionTotal = 0;
    const orderIds = new Set<number>();

    for (const entry of entries) {
        const amount = parseFloat(entry.amount) || 0;
        if (entry.source === "order_expense") orderExpenseTotal += amount;
        if (entry.source === "manual_commission") manualCommissionTotal += amount;
        if (entry.ownerType === "sr") srCommissionTotal += amount;
        if (entry.ownerType === "db_point") dbPointCommissionTotal += amount;
        if (entry.orderId !== null) orderIds.add(entry.orderId);
    }

    return {
        totalAmount: (orderExpenseTotal + manualCommissionTotal).toFixed(2),
        orderExpenseTotal: orderExpenseTotal.toFixed(2),
        srCommissionTotal: srCommissionTotal.toFixed(2),
        dbPointCommissionTotal: dbPointCommissionTotal.toFixed(2),
        manualCommissionTotal: manualCommissionTotal.toFixed(2),
        entryCount: entries.length,
        orderCount: orderIds.size,
    };
}
