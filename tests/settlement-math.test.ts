import { expect, test } from "bun:test";
import { calculateSettlement, type SettlementInput } from "../src/modules/wholesale/settlement-math";

const none: SettlementInput = {
    orderTotal: 0, totalReturns: 0, totalAdjustmentDiscount: 0, settlementDamage: 0, totalExpenses: 0,
    totalPayments: 0, totalCustomerDues: 0, totalDsrDues: 0, totalSrDues: 0,
};

test("a product-entry discount is not shown as DUE (client's invoice, 11/11/2026)", () => {
    // Lines worth 4202.08 with a 10 Tk discount at product entry: order.total = 4192.08.
    const result = calculateSettlement({
        ...none,
        orderTotal: 4192.08,
        totalAdjustmentDiscount: 321.43,
        totalExpenses: 140.65,
        totalCustomerDues: 3730,
    });
    expect(result.netTotal).toBe(3730);
    expect(result.due).toBe(0);
});

test("returns, damage, payments and every due type are all taken off", () => {
    const result = calculateSettlement({
        orderTotal: 1000, totalReturns: 100, totalAdjustmentDiscount: 50, settlementDamage: 25, totalExpenses: 25,
        totalPayments: 300, totalCustomerDues: 200, totalDsrDues: 100, totalSrDues: 50,
    });
    expect(result.netTotal).toBe(800);
    expect(result.totalAdjustment).toBe(650);
    expect(result.due).toBe(150);
});

test("float noise does not leave a stray paisa of DUE, and overpayment shows 0, not negative", () => {
    expect(calculateSettlement({ ...none, orderTotal: 0.1 + 0.2, totalPayments: 0.3 }).due).toBe(0);
    expect(calculateSettlement({ ...none, orderTotal: 100, totalPayments: 120 }).due).toBe(0);
});
