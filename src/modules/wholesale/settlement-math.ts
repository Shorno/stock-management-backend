/**
 * Settlement totals, shared so the summary shown on invoices/PDFs uses the same rule
 * as the settlement page and the save path.
 *
 * Product-entry discounts are already inside `orderTotal` (order.total = subtotal - discount).
 * Do not rebuild the total from quantity x price per item: that drops those discounts,
 * and the discount then reappears as an unpaid DUE.
 */
export interface SettlementInput {
    /** order.total: line amounts after product-entry discounts. */
    orderTotal: number;
    /** Returned quantity x sale price, summed over items. */
    totalReturns: number;
    totalAdjustmentDiscount: number;
    settlementDamage: number;
    totalExpenses: number;
    totalPayments: number;
    totalCustomerDues: number;
    totalDsrDues: number;
    totalSrDues: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateSettlement(input: SettlementInput) {
    const netTotal = round2(
        input.orderTotal
        - input.totalReturns
        - input.totalAdjustmentDiscount
        - input.settlementDamage
        - input.totalExpenses,
    );
    const totalAdjustment = round2(input.totalPayments + input.totalCustomerDues + input.totalDsrDues + input.totalSrDues);
    const due = Math.max(0, round2(netTotal - totalAdjustment));
    return { netTotal, totalAdjustment, due };
}
