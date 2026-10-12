// Net asset ledger entries for an order adjustment.
//
// The ledger is a running sum of netAssetChange, so re-saving an adjustment must
// record only what changed since the previous save. Recording the full totals
// again on every edit would count the same payments, dues, and expenses twice.

export interface AdjustmentAmounts {
    payments: { amount: number }[];
    expenses: { amount: number }[];
    customerDues: { amount: number }[];
    dsrDues: { amount: number; customerId?: number | null }[];
    itemReturns: { returnAmount?: number | null }[];
    damageReturns: { quantity: number; sellingPrice: number }[];
}

export interface AdjustmentTotals {
    payments: number;
    expenses: number;
    customerDues: number;
    dsrDues: number;
    itemReturns: number;
    damageReturns: number;
}

export interface AdjustmentLedgerEntry {
    transactionType: string;
    description: string;
    amount: number;
    netAssetChange: number;
    affectedComponent: string;
}

export const EMPTY_ADJUSTMENT: AdjustmentAmounts = {
    payments: [],
    expenses: [],
    customerDues: [],
    dsrDues: [],
    itemReturns: [],
    damageReturns: [],
};

const toCents = (value: number) => Math.round(value * 100);
// Amounts are stored rounded to paisa, so round the same way before comparing saves
const round2 = (value: number) => toCents(value) / 100;
const sum = (values: number[]) => values.reduce((total, value) => total + round2(value), 0);

export const summarizeAdjustment = (data: AdjustmentAmounts): AdjustmentTotals => ({
    payments: sum(data.payments.map((p) => p.amount)),
    expenses: sum(data.expenses.map((e) => e.amount)),
    // A DSR due that names a customer is stored as a customer due
    customerDues: sum(data.customerDues.map((d) => d.amount))
        + sum(data.dsrDues.filter((d) => d.customerId).map((d) => d.amount)),
    dsrDues: sum(data.dsrDues.filter((d) => !d.customerId).map((d) => d.amount)),
    itemReturns: sum(data.itemReturns.map((r) => r.returnAmount || 0)),
    damageReturns: sum(data.damageReturns.map((d) => d.quantity * round2(d.sellingPrice))),
});

const COMPONENTS: {
    key: keyof AdjustmentTotals;
    transactionType: string;
    label: string;
    affectedComponent: string;
    // Direction of the net asset change for an increase in this component
    sign: 1 | -1;
}[] = [
    { key: "payments", transactionType: "order_payment", label: "Payment received", affectedComponent: "cash", sign: 1 },
    { key: "customerDues", transactionType: "customer_due_created", label: "Customer due", affectedComponent: "customerDue", sign: 1 },
    { key: "dsrDues", transactionType: "dsr_due_created", label: "DSR due", affectedComponent: "dsrDue", sign: 1 },
    { key: "expenses", transactionType: "order_expense", label: "Expense", affectedComponent: "cash", sign: -1 },
    { key: "itemReturns", transactionType: "item_return", label: "Item returns", affectedComponent: "cash", sign: -1 },
    { key: "damageReturns", transactionType: "damage_item", label: "Damage returns", affectedComponent: "damageReturns", sign: 1 },
];

const formatTaka = (value: number) => `৳${value.toLocaleString()}`;

export const buildAdjustmentLedgerEntries = (
    previous: AdjustmentTotals,
    next: AdjustmentTotals,
    orderNumber: string
): AdjustmentLedgerEntry[] => {
    const entries: AdjustmentLedgerEntry[] = [];

    for (const component of COMPONENTS) {
        const before = previous[component.key];
        const after = next[component.key];
        const deltaCents = toCents(after) - toCents(before);
        if (deltaCents === 0) continue;

        const delta = deltaCents / 100;
        const description = toCents(before) === 0
            ? `${component.label} for Order ${orderNumber} — ${formatTaka(after)}`
            : `${component.label} for Order ${orderNumber} edited ${formatTaka(before)} → ${formatTaka(after)}`;

        entries.push({
            transactionType: component.transactionType,
            description,
            amount: Math.abs(delta),
            netAssetChange: component.sign * delta,
            affectedComponent: component.affectedComponent,
        });
    }

    return entries;
};
