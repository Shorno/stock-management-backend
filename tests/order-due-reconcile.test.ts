import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { orderCustomerDues, orderDsrDues, orderSrDues } from "../src/db/schema";
import { planDueReconciliation } from "../src/modules/wholesale/due-reconcile";
import { reconcileOrderDues } from "../src/modules/wholesale/order-dues";
import type { SaveAdjustmentInput } from "../src/modules/wholesale/validation";

const row = (id: number, key: string, amount: number, collectedAmount = 0) => ({
    id, key, amount, collectedAmount, label: key,
});

describe("planDueReconciliation", () => {
    test("keeps the collected row when its amount is edited", () => {
        const plan = planDueReconciliation(
            [row(1, "A", 5000, 2000), row(2, "B", 3000)],
            [{ dueId: 1, key: "A", amount: 4800, label: "A" }, { dueId: 2, key: "B", amount: 3000, label: "B" }],
            "Customer due"
        );
        expect(plan.updates.map((u) => [u.row.id, u.entry.amount])).toEqual([[1, 4800], [2, 3000]]);
        expect(plan.inserts).toEqual([]);
        expect(plan.deletes).toEqual([]);
    });

    test("falls back to the same customer when no id is sent", () => {
        const plan = planDueReconciliation(
            [row(1, "A", 5000, 2000), row(2, "B", 3000)],
            [{ key: "B", amount: 3000, label: "B" }, { key: "A", amount: 4800, label: "A" }],
            "Customer due"
        );
        expect(plan.updates.map((u) => [u.row.id, u.entry.key])).toEqual([[2, "B"], [1, "A"]]);
    });

    test("ignores an id that does not belong to this order", () => {
        const plan = planDueReconciliation(
            [row(1, "A", 5000, 2000)],
            [{ dueId: 999, key: "A", amount: 5000, label: "A" }],
            "Customer due"
        );
        expect(plan.updates.map((u) => u.row.id)).toEqual([1]);
    });

    test("rejects lowering a due below what was collected", () => {
        expect(() => planDueReconciliation(
            [row(1, "A", 5000, 2000)],
            [{ dueId: 1, key: "A", amount: 1500, label: "A" }],
            "Customer due"
        )).toThrow("cannot be less than ৳2000.00");
    });

    test("allows lowering a due to exactly what was collected", () => {
        const plan = planDueReconciliation(
            [row(1, "A", 5000, 2000)],
            [{ dueId: 1, key: "A", amount: 2000, label: "A" }],
            "Customer due"
        );
        expect(plan.updates).toHaveLength(1);
    });

    test("rejects removing a due that has collections", () => {
        expect(() => planDueReconciliation([row(1, "A", 5000, 2000)], [], "Customer due"))
            .toThrow("cannot be removed");
    });

    test("deletes an uncollected due that was removed", () => {
        const plan = planDueReconciliation([row(1, "A", 5000)], [], "Customer due");
        expect(plan.deletes.map((d) => d.id)).toEqual([1]);
    });

    test("rejects moving a collected due to another customer", () => {
        expect(() => planDueReconciliation(
            [row(1, "A", 5000, 2000)],
            [{ dueId: 1, key: "C", amount: 5000, label: "C" }],
            "Customer due"
        )).toThrow("cannot be moved");
    });

    test("allows moving an uncollected due to another customer", () => {
        const plan = planDueReconciliation(
            [row(1, "A", 5000)],
            [{ dueId: 1, key: "C", amount: 5000, label: "C" }],
            "Customer due"
        );
        expect(plan.updates.map((u) => [u.row.id, u.entry.key])).toEqual([[1, "C"]]);
    });
});

// Real Postgres queries against isolated fixtures, never the configured database.
const client = new PGlite();
const db = drizzle(client, { schema });

const adjustment = (overrides: Partial<SaveAdjustmentInput>): SaveAdjustmentInput => ({
    payments: [],
    expenses: [],
    customerDues: [],
    dsrDues: [],
    srDues: [],
    damageReturns: [],
    itemReturns: [],
    paymentDate: "2026-10-10",
    ...overrides,
});

const ORDER = { id: 10, dsrId: 1 };

beforeEach(async () => {
    await client.exec(`
        DROP TABLE IF EXISTS order_customer_dues, order_dsr_dues, order_sr_dues, customer, dsr, sr;
        CREATE TABLE customer (id integer PRIMARY KEY, name varchar(100) NOT NULL);
        CREATE TABLE dsr (id integer PRIMARY KEY, name varchar(100) NOT NULL);
        CREATE TABLE sr (id integer PRIMARY KEY, name varchar(100) NOT NULL);
        CREATE TABLE order_customer_dues (
            id serial PRIMARY KEY,
            order_id integer NOT NULL,
            customer_id integer,
            customer_name varchar(150) NOT NULL,
            amount numeric(10,2) NOT NULL,
            collected_amount numeric(10,2) NOT NULL DEFAULT 0,
            entry_source varchar(20) NOT NULL DEFAULT 'customer_due',
            note text,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE TABLE order_dsr_dues (
            id serial PRIMARY KEY,
            order_id integer NOT NULL,
            dsr_id integer NOT NULL,
            amount numeric(10,2) NOT NULL,
            collected_amount numeric(10,2) NOT NULL DEFAULT 0,
            customer_id integer,
            note text,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
        );
        CREATE TABLE order_sr_dues (
            id serial PRIMARY KEY,
            order_id integer NOT NULL,
            sr_id integer NOT NULL,
            amount numeric(10,2) NOT NULL,
            collected_amount numeric(10,2) NOT NULL DEFAULT 0,
            customer_id integer,
            note text,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
        );
        INSERT INTO customer VALUES (1, 'Shyamoli Pharmacy'), (2, 'Radha Gobinda'), (3, 'Miran');
        INSERT INTO dsr VALUES (1, 'Arif');
        INSERT INTO sr VALUES (5, 'Shojib');
        INSERT INTO order_customer_dues (id, order_id, customer_id, customer_name, amount, collected_amount, entry_source) VALUES
            (101, 10, 1, 'Shyamoli Pharmacy', 5000, 2000, 'customer_due'),
            (102, 10, 2, 'Radha Gobinda', 3000, 0, 'customer_due'),
            (103, 10, 3, 'Miran', 1000, 400, 'dsr_due');
        INSERT INTO order_dsr_dues (id, order_id, dsr_id, amount, collected_amount) VALUES (201, 10, 1, 700, 300);
        INSERT INTO order_sr_dues (id, order_id, sr_id, amount, collected_amount) VALUES (301, 10, 5, 900, 900);
        SELECT setval('order_customer_dues_id_seq', 1000);
        SELECT setval('order_dsr_dues_id_seq', 1000);
        SELECT setval('order_sr_dues_id_seq', 1000);
    `);
});

afterAll(async () => {
    await client.close();
});

const customerDueRows = () =>
    db.select().from(orderCustomerDues).where(eq(orderCustomerDues.orderId, 10)).orderBy(asc(orderCustomerDues.id));

describe("reconcileOrderDues", () => {
    test("editing a partially collected due keeps the collection (client scenario)", async () => {
        const totals = await db.transaction((tx) => reconcileOrderDues(tx, ORDER, adjustment({
            customerDues: [
                { dueId: 101, customerId: 1, customerName: "Shyamoli Pharmacy", amount: 4800 },
                { dueId: 102, customerId: 2, customerName: "Radha Gobinda", amount: 3000 },
            ],
            dsrDues: [{ dueId: 103, dueSource: "customer_due", customerId: 3, amount: 1000 }, { dueId: 201, dueSource: "dsr_due", amount: 700 }],
            srDues: [{ dueId: 301, srId: 5, amount: 900 }],
        })));

        const rows = await customerDueRows();
        expect(rows.map((r) => [r.id, r.amount, r.collectedAmount, r.entrySource])).toEqual([
            [101, "4800.00", "2000.00", "customer_due"],
            [102, "3000.00", "0.00", "customer_due"],
            [103, "1000.00", "400.00", "dsr_due"],
        ]);
        const [dsrDue] = await db.select().from(orderDsrDues);
        expect([dsrDue!.id, dsrDue!.collectedAmount]).toEqual([201, "300.00"]);
        const [srDue] = await db.select().from(orderSrDues);
        expect([srDue!.id, srDue!.collectedAmount]).toEqual([301, "900.00"]);
        expect(totals).toEqual({ customerDues: 8800, dsrDues: 700, srDues: 900 });
    });

    test("a stale client that sends no ids still keeps collections", async () => {
        await db.transaction((tx) => reconcileOrderDues(tx, ORDER, adjustment({
            customerDues: [
                { customerId: 2, customerName: "Radha Gobinda", amount: 2500 },
                { customerId: 1, customerName: "Shyamoli Pharmacy", amount: 4800 },
            ],
            dsrDues: [{ customerId: 3, amount: 1000 }, { amount: 700 }],
            srDues: [{ srId: 5, amount: 900 }],
        })));

        const rows = await customerDueRows();
        expect(rows.map((r) => [r.id, r.amount, r.collectedAmount])).toEqual([
            [101, "4800.00", "2000.00"],
            [102, "2500.00", "0.00"],
            [103, "1000.00", "400.00"],
        ]);
    });

    test("new and removed uncollected dues are inserted and deleted", async () => {
        await db.transaction((tx) => reconcileOrderDues(tx, ORDER, adjustment({
            customerDues: [
                { dueId: 101, customerId: 1, customerName: "Shyamoli Pharmacy", amount: 5000 },
                { customerId: 3, customerName: "Miran", amount: 250 },
            ],
            dsrDues: [{ dueId: 103, dueSource: "customer_due", customerId: 3, amount: 1000 }, { dueId: 201, dueSource: "dsr_due", amount: 700 }],
            srDues: [{ dueId: 301, srId: 5, amount: 900 }],
        })));

        const rows = await customerDueRows();
        expect(rows.map((r) => [r.customerId, r.amount, r.collectedAmount, r.entrySource])).toEqual([
            [1, "5000.00", "2000.00", "customer_due"],
            [3, "1000.00", "400.00", "dsr_due"],
            [3, "250.00", "0.00", "customer_due"],
        ]);
    });

    test("lowering a due below its collection rolls back the whole edit", async () => {
        await expect(db.transaction((tx) => reconcileOrderDues(tx, ORDER, adjustment({
            customerDues: [
                { dueId: 101, customerId: 1, customerName: "Shyamoli Pharmacy", amount: 1500 },
                { dueId: 102, customerId: 2, customerName: "Radha Gobinda", amount: 100 },
            ],
            dsrDues: [{ dueId: 103, dueSource: "customer_due", customerId: 3, amount: 1000 }, { dueId: 201, dueSource: "dsr_due", amount: 700 }],
            srDues: [{ dueId: 301, srId: 5, amount: 900 }],
        })))).rejects.toThrow("Customer due for Shyamoli Pharmacy cannot be less than ৳2000.00");

        const rows = await customerDueRows();
        expect(rows.map((r) => r.amount)).toEqual(["5000.00", "3000.00", "1000.00"]);
    });

    test("removing a collected SR due is rejected", async () => {
        await expect(db.transaction((tx) => reconcileOrderDues(tx, ORDER, adjustment({
            customerDues: [
                { dueId: 101, customerId: 1, customerName: "Shyamoli Pharmacy", amount: 5000 },
                { dueId: 102, customerId: 2, customerName: "Radha Gobinda", amount: 3000 },
            ],
            dsrDues: [{ dueId: 103, dueSource: "customer_due", customerId: 3, amount: 1000 }, { dueId: 201, dueSource: "dsr_due", amount: 700 }],
        })))).rejects.toThrow("SR due for Shojib cannot be removed");
    });

    test("moving a collected DSR due onto a customer is rejected", async () => {
        await expect(db.transaction((tx) => reconcileOrderDues(tx, ORDER, adjustment({
            customerDues: [
                { dueId: 101, customerId: 1, customerName: "Shyamoli Pharmacy", amount: 5000 },
                { dueId: 102, customerId: 2, customerName: "Radha Gobinda", amount: 3000 },
            ],
            dsrDues: [{ dueId: 103, dueSource: "customer_due", customerId: 3, amount: 1000 }, { dueId: 201, dueSource: "dsr_due", customerId: 2, amount: 700 }],
            srDues: [{ dueId: 301, srId: 5, amount: 900 }],
        })))).rejects.toThrow("DSR due for Arif cannot be removed");
    });
});
