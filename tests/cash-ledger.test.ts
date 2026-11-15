import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import * as schema from "../src/db/schema";

// The whole schema in an in-memory Postgres, so the real settlement, payment and dashboard code runs.
const client = new PGlite();
const database = drizzle(client, { schema });
// PGlite has one connection; run transactions on it directly (see sr-merge.test.ts).
(database as unknown as { transaction: unknown }).transaction = async (fn: (tx: typeof database) => Promise<unknown>) => {
    await client.exec("BEGIN");
    try {
        const result = await fn(database);
        await client.exec("COMMIT");
        return result;
    } catch (error) {
        await client.exec("ROLLBACK");
        throw error;
    }
};
mock.module("../src/db/config", () => ({ db: database }));

const { getCashLedger } = await import("../src/modules/cash-ledger/service");
const { cashLedgerRoutes } = await import("../src/modules/cash-ledger/routes");
const { getDashboardStats, getCurrentCashBalance } = await import("../src/modules/analytics/service");
const { createOrder, saveOrderAdjustment } = await import("../src/modules/wholesale/service");
const { createOrderSchema, saveAdjustmentSchema } = await import("../src/modules/wholesale/validation");
const { addPayment } = await import("../src/modules/supplier/service");
const { createWithdrawal } = await import("../src/modules/cash-withdrawal/service");
const { createBill } = await import("../src/modules/bills/service");

beforeAll(async () => {
    const { pushSchema } = await import("drizzle-kit/api");
    await (await pushSchema(schema, database as never)).apply();
}, 60000);

const order = (quantity: number, orderDate: string) => createOrderSchema.parse({
    dsrId: 1, routeId: 1, orderDate,
    items: [{ productId: 1, batchId: 1, brandId: 1, quantity, unit: "PCS", totalQuantity: quantity, salePrice: 10 }],
});

/**
 * One of every kind of cash movement, spread over a few days:
 *   01-01 opening cash +1000
 *   11-01 order A settled: paid 300 cash, 50 expense (not cash), 150 customer due
 *   11-02 customer due collected +100, DSR due collected +40, SR due collected +25
 *   11-03 supplier payment from cash −200, supplier payment NOT from cash (ignored), damage credit (ignored)
 *   11-04 withdrawal −150, bill −80
 *   11-05 order B settled: paid 500
 * Final balance: 1000 + 300 + 100 + 40 + 25 − 200 − 150 − 80 + 500 = 1535
 */
beforeEach(async () => {
    const { rows } = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    await client.exec(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await client.exec(`
        INSERT INTO unit (name, abbreviation, multiplier, is_base) VALUES ('Piece', 'PCS', 1, true);
        INSERT INTO category (name) VALUES ('Food');
        INSERT INTO brand (name) VALUES ('ACI'), ('BD Food');
        INSERT INTO product (code, name, category_id, brand_id) VALUES ('A1', 'ACI Salt', 1, 1);
        INSERT INTO product_variant (product_id, variant_type, label) VALUES (1, 'pack', '1kg');
        INSERT INTO stock_batch (variant_id, supplier_price, sell_price, initial_quantity, remaining_quantity)
            VALUES (1, 8, 10, 1000, 1000);
        INSERT INTO dsr (name) VALUES ('Rahim');
        INSERT INTO sr (name, brand_id) VALUES ('Shawon', 1);
        INSERT INTO route (name) VALUES ('Sadar');
        INSERT INTO customer (name, shop_name) VALUES ('Karim', 'Karim Store');
        INSERT INTO bill_types (code, name) VALUES ('rent', 'Rent');
        INSERT INTO opening_balances (type, amount, balance_date, note) VALUES ('cash', 1000, '2026-01-01', 'Cash in hand');
    `);

    const orderA = (await createOrder(order(50, "2026-11-01"))).id; // 500
    await saveOrderAdjustment(orderA, saveAdjustmentSchema.parse({
        paymentDate: "2026-11-01",
        payments: [{ amount: 300, method: "Cash" }],
        expenses: [{ type: "transport", amount: 50 }],
        customerDues: [{ customerId: 1, customerName: "Karim", amount: 150 }],
    }));

    await client.exec(`
        INSERT INTO due_collections (customer_id, order_id, amount, collection_date, payment_method, created_at)
            VALUES (1, 1, 100, '2026-11-02', 'Cash', '2026-11-02 10:00');
        INSERT INTO dsr_due_collections (dsr_id, amount, collection_date, created_at) VALUES (1, 40, '2026-11-02', '2026-11-02 10:01');
        INSERT INTO sr_due_collections (sr_id, amount, collection_date, created_at) VALUES (1, 25, '2026-11-02', '2026-11-02 10:02');
    `);

    await addPayment(1, { amount: 200, paymentDate: "2026-11-03", paymentMethod: "Cash", fromCashBalance: true });
    await addPayment(2, { amount: 999, paymentDate: "2026-11-03", paymentMethod: "Bank", fromCashBalance: false });
    await client.exec(`INSERT INTO supplier_payments (brand_id, amount, payment_date, payment_method, is_damage_credit)
        VALUES (1, 77, '2026-11-03', 'Damage Credit', true)`);

    const withdrawal = await createWithdrawal({ amount: 150, withdrawalDate: "2026-11-04", note: "Owner" });
    expect(withdrawal.success).toBe(true);
    await createBill({ title: "Shop rent", amount: 80, billDate: "2026-11-04", billTypeId: 1 });
    // Recorded after the withdrawal (both can land in the same millisecond here)
    await client.exec(`UPDATE bills SET created_at = created_at + interval '1 second'`);

    const orderB = (await createOrder(order(50, "2026-11-05"))).id;
    await saveOrderAdjustment(orderB, saveAdjustmentSchema.parse({
        paymentDate: "2026-11-05",
        payments: [{ amount: 500, method: "Cash" }],
    }));
});

describe("cash ledger", () => {
    test("ends on exactly the dashboard's Cash Balance", async () => {
        const ledger = await getCashLedger({ order: "asc", limit: 500 });
        const dashboard = await getDashboardStats();

        expect(dashboard.cashBalance).toBe(1535);
        expect(await getCurrentCashBalance()).toBe(1535);
        expect(ledger.summary.currentBalance).toBe(dashboard.cashBalance);
        expect(ledger.summary.closingBalance).toBe(dashboard.cashBalance);
        expect(ledger.entries.at(-1)!.balance).toBe(dashboard.cashBalance);
        // Every row: balance = previous balance + this movement
        let running = 0;
        for (const entry of ledger.entries) {
            running = Math.round((running + entry.amount) * 100) / 100;
            expect(entry.balance).toBe(running);
        }
    });

    test("lists each movement once, with its source, in date order", async () => {
        const ledger = await getCashLedger({ order: "asc" });

        expect(ledger.entries.map((e) => [e.date, e.type, e.amount])).toEqual([
            ["2026-01-01", "opening_cash", 1000],
            ["2026-11-01", "order_payment", 300],
            ["2026-11-02", "due_collection", 100],
            ["2026-11-02", "dsr_due_collection", 40],
            ["2026-11-02", "sr_due_collection", 25],
            ["2026-11-03", "supplier_payment", -200],
            ["2026-11-04", "cash_withdrawal", -150],
            ["2026-11-04", "bill", -80],
            ["2026-11-05", "order_payment", 500],
        ]);
        const [, payment, collection, , , supplier, , bill] = ledger.entries;
        expect(payment).toMatchObject({ orderId: 1, orderNumber: expect.any(String), party: "Rahim", moneyIn: 300, moneyOut: 0, method: "Cash" });
        expect(collection).toMatchObject({ party: "Karim Store", entityId: 1, orderId: 1 });
        expect(supplier).toMatchObject({ party: "ACI", entityId: 1, moneyIn: 0, moneyOut: 200 });
        expect(bill).toMatchObject({ party: "Shop rent", method: "Rent", moneyOut: 80 });
        expect(ledger.summary).toMatchObject({ openingBalance: 0, totalIn: 1965, totalOut: 430 });
    });

    test("a date range starts from the balance brought forward", async () => {
        const ledger = await getCashLedger({ startDate: "2026-11-02", endDate: "2026-11-04", order: "asc" });

        // 1000 opening + 300 payment before the range
        expect(ledger.summary.openingBalance).toBe(1300);
        expect(ledger.summary.totalIn).toBe(165);
        expect(ledger.summary.totalOut).toBe(430);
        expect(ledger.summary.closingBalance).toBe(1300 + 165 - 430);
        expect(ledger.entries.at(-1)!.balance).toBe(ledger.summary.closingBalance);
        expect(ledger.entries.map((e) => e.date).every((d) => d >= "2026-11-02" && d <= "2026-11-04")).toBe(true);
        expect(ledger.summary.currentBalance).toBe(1535);
        expect(ledger.days).toEqual([
            { date: "2026-11-02", moneyIn: 165, moneyOut: 0, balance: 1465 },
            { date: "2026-11-03", moneyIn: 0, moneyOut: 200, balance: 1265 },
            { date: "2026-11-04", moneyIn: 0, moneyOut: 230, balance: 1035 },
        ]);
    });

    test("filters by type but keeps the real cash balance on each row", async () => {
        const ledger = await getCashLedger({ types: ["order_payment"], order: "asc" });

        expect(ledger.entries.map((e) => [e.amount, e.balance])).toEqual([[300, 1300], [500, 1535]]);
        expect(ledger.summary).toMatchObject({ totalIn: 800, totalOut: 0, closingBalance: 1535 });
        expect(ledger.pagination.total).toBe(2);
        expect(ledger.summary.byType).toEqual([{ type: "order_payment", moneyIn: 800, moneyOut: 0, count: 2 }]);
    });

    test("pages newest first by default", async () => {
        const first = await getCashLedger({ limit: 4 });
        const last = await getCashLedger({ limit: 4, page: 3 });

        expect(first.pagination).toEqual({ page: 1, limit: 4, total: 9, totalPages: 3 });
        expect(first.entries[0]).toMatchObject({ date: "2026-11-05", balance: 1535 });
        expect(last.entries).toHaveLength(1);
        expect(last.entries[0]).toMatchObject({ type: "opening_cash", balance: 1000 });
    });

    test("re-settling an order replaces its payment in the ledger", async () => {
        await saveOrderAdjustment(2, saveAdjustmentSchema.parse({
            paymentDate: "2026-11-06",
            payments: [{ amount: 450, method: "Cash" }],
            customerDues: [{ customerId: 1, customerName: "Karim", amount: 50 }],
        }));
        const ledger = await getCashLedger({ order: "asc" });

        expect(ledger.entries.at(-1)).toMatchObject({ date: "2026-11-06", amount: 450, balance: 1485 });
        expect(ledger.summary.currentBalance).toBe((await getDashboardStats()).cashBalance);
    });

    test("the route checks the role and the query", async () => {
        const app = (role: string | null) => new Hono<{ Variables: { user: unknown } }>()
            .use("*", async (c, next) => { c.set("user", role ? { id: "u", role } : null); await next(); })
            .route("/cash-ledger", cashLedgerRoutes);

        expect((await app(null).request("/cash-ledger")).status).toBe(401);
        expect((await app("dsr").request("/cash-ledger")).status).toBe(403);
        expect((await app("admin").request("/cash-ledger?types=nope")).status).toBe(400);

        const response = await app("manager").request("/cash-ledger?startDate=2026-11-02&types=bill,cash_withdrawal&limit=10");
        expect(response.status).toBe(200);
        const body = await response.json() as { data: { entries: { type: string }[]; summary: { totalOut: number } } };
        expect(body.data.entries.map((e) => e.type).sort()).toEqual(["bill", "cash_withdrawal"]);
        expect(body.data.summary.totalOut).toBe(230);
    });
});
