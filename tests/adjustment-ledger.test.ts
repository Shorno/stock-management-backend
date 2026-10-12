import { describe, expect, test } from "bun:test";
import {
    buildAdjustmentLedgerEntries,
    summarizeAdjustment,
    EMPTY_ADJUSTMENT,
    type AdjustmentAmounts,
} from "../src/modules/wholesale/adjustment-ledger";

const saved: AdjustmentAmounts = {
    payments: [{ amount: 16220 }, { amount: 250 }],
    expenses: [{ amount: 2306.97 }],
    customerDues: [{ amount: 6065 }],
    dsrDues: [{ amount: 2561, customerId: 122 }, { amount: 700 }],
    itemReturns: [{ returnAmount: 3964.54 }],
    damageReturns: [{ quantity: 3, sellingPrice: 10.004 }],
};

describe("adjustment ledger entries", () => {
    test("first save records the full amounts", () => {
        const entries = buildAdjustmentLedgerEntries(
            summarizeAdjustment(EMPTY_ADJUSTMENT), summarizeAdjustment(saved), "WO-1");

        expect(entries.map((e) => [e.transactionType, e.amount, e.netAssetChange])).toEqual([
            ["order_payment", 16470, 16470],
            ["customer_due_created", 8626, 8626],
            ["dsr_due_created", 700, 700],
            ["order_expense", 2306.97, -2306.97],
            ["item_return", 3964.54, -3964.54],
            ["damage_item", 30, 30],
        ]);
    });

    test("re-saving without changes records nothing", () => {
        // The stored state comes back rounded to paisa and with converted DSR dues on customer rows
        const reloaded: AdjustmentAmounts = { ...saved, damageReturns: [{ quantity: 3, sellingPrice: 10 }] };
        expect(buildAdjustmentLedgerEntries(summarizeAdjustment(reloaded), summarizeAdjustment(saved), "WO-1")).toEqual([]);
    });

    test("an edit records only the difference, in the right direction", () => {
        const edited: AdjustmentAmounts = {
            ...saved,
            payments: [{ amount: 16220 }],
            customerDues: [{ amount: 6065 }, { amount: 1000 }],
            expenses: [{ amount: 2306.97 }, { amount: 100 }],
        };

        const entries = buildAdjustmentLedgerEntries(summarizeAdjustment(saved), summarizeAdjustment(edited), "WO-1");

        expect(entries).toEqual([
            {
                transactionType: "order_payment",
                description: "Payment received for Order WO-1 edited ৳16,470 → ৳16,220",
                amount: 250,
                netAssetChange: -250,
                affectedComponent: "cash",
            },
            {
                transactionType: "customer_due_created",
                description: "Customer due for Order WO-1 edited ৳8,626 → ৳9,626",
                amount: 1000,
                netAssetChange: 1000,
                affectedComponent: "customerDue",
            },
            {
                transactionType: "order_expense",
                description: "Expense for Order WO-1 edited ৳2,306.97 → ৳2,406.97",
                amount: 100,
                netAssetChange: -100,
                affectedComponent: "cash",
            },
        ]);
    });

    test("repeated identical saves keep the ledger total equal to one save", () => {
        let previous = summarizeAdjustment(EMPTY_ADJUSTMENT);
        let ledgerTotal = 0;
        for (let i = 0; i < 3; i++) {
            const next = summarizeAdjustment(saved);
            ledgerTotal += buildAdjustmentLedgerEntries(previous, next, "WO-1")
                .reduce((total, e) => total + e.netAssetChange, 0);
            previous = next;
        }
        expect(Math.round(ledgerTotal * 100) / 100).toBe(19554.49); // one save: 16470 + 8626 + 700 - 2306.97 - 3964.54 + 30
    });
});
