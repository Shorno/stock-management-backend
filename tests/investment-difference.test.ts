import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { db as applicationDb } from "../src/db/config";
import {
    createPlAdjustment,
    getPlAdjustmentNetEffects,
    plAdjustmentNetAssetChange,
} from "../src/modules/pl-adjustments/service";
import { calculateInvestmentDifference, getDifferenceHistory } from "../src/modules/investment/service";

// Every service call is explicitly given this in-memory Postgres database.
// No service in these tests queries the configured application database.
const client = new PGlite();
const fixtureDb = drizzle(client, { schema });
const database = fixtureDb as unknown as typeof applicationDb;

beforeAll(async () => {
    // The table as production has it before migration 0014
    await client.exec(`
        CREATE TABLE pl_adjustments (id serial PRIMARY KEY, title text NOT NULL, type text NOT NULL, amount numeric(12,2) DEFAULT '0.00' NOT NULL, note text, adjustment_date text NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        INSERT INTO pl_adjustments (title, type, amount, adjustment_date) VALUES ('Old income', 'income', 10000, '2026-09-01'), ('Old expense', 'expense', 2500, '2026-09-02');
    `);
    await client.exec(await Bun.file(new URL("../drizzle/0014_pl_adjustment_net_assets.sql", import.meta.url)).text());
}, 20000);

beforeEach(async () => {
    await client.exec(`DELETE FROM pl_adjustments WHERE id > 2;`);
});

afterAll(async () => { await client.close(); });

describe("P&L adjustments and net assets", () => {
    test("the migration keeps every existing adjustment profit-only", async () => {
        const rows = await fixtureDb.select().from(schema.plAdjustments).orderBy(schema.plAdjustments.id);
        expect(rows.map((r) => r.affectsNetAssets)).toEqual([false, false]);
        expect(rows.map(plAdjustmentNetAssetChange)).toEqual([0, 0]);
    });

    test("new adjustments count in net assets: income adds, expense subtracts", async () => {
        const income = await createPlAdjustment({ title: "Bonus", type: "income", amount: "5000", adjustmentDate: "2026-10-14" }, database);
        const expense = await createPlAdjustment({ title: "Rent", type: "expense", amount: "1200.50", adjustmentDate: "2026-10-14" }, database);

        expect(income.affectsNetAssets).toBe(true);
        expect(plAdjustmentNetAssetChange(income)).toBe(5000);
        expect(plAdjustmentNetAssetChange(expense)).toBe(-1200.5);
    });

    test("an insert that leaves the flag out still counts in net assets", async () => {
        await client.exec(`INSERT INTO pl_adjustments (title, type, amount, adjustment_date) VALUES ('Raw insert', 'income', 300, '2026-10-14');`);
        const [row] = await fixtureDb.select().from(schema.plAdjustments).orderBy(schema.plAdjustments.id).offset(2);
        expect(row!.affectsNetAssets).toBe(true);
    });

    test("totals split new adjustments from older profit-only ones", async () => {
        await createPlAdjustment({ title: "Bonus", type: "income", amount: "5000", adjustmentDate: "2026-10-14" }, database);
        await createPlAdjustment({ title: "Rent", type: "expense", amount: "1200.50", adjustmentDate: "2026-10-14" }, database);

        expect(await getPlAdjustmentNetEffects(database)).toEqual({ netAssets: 3799.5, profitOnly: 7500 });
    });
});

describe("investment difference", () => {
    // The client's walkthrough: 2,00,000 invested, 11,000 sale with 1,000 profit
    const base = { investmentBalance: 200000, profitLoss: 1000 };

    test("matches when net assets equal investment + profit", () => {
        expect(calculateInvestmentDifference({ ...base, netAssets: 201000 }).difference).toBe(0);
    });

    test("cash taken home shows as a minus difference", () => {
        expect(calculateInvestmentDifference({ ...base, netAssets: 190000 }).difference).toBe(-11000);
    });

    test("extra money paid online from home shows as a plus difference", () => {
        expect(calculateInvestmentDifference({ ...base, netAssets: 221000 }).difference).toBe(20000);
    });

    test("uses the same profit as the P&L card, older profit-only adjustments included", () => {
        // Client's reset: investment set equal to net assets while the P&L card showed 0
        expect(calculateInvestmentDifference({ netAssets: 1914554.42, investmentBalance: 1914554.42, profitLoss: 0 }).difference).toBe(0);
    });

    test("rounds to paisa without a negative zero", () => {
        const result = calculateInvestmentDifference({ investmentBalance: 0.1, profitLoss: 0.2, netAssets: 0.3 });
        expect(Object.is(result.difference, 0)).toBe(true);
    });
});

describe("difference history", () => {
    beforeAll(async () => {
        // The ledger as production has it before migration 0015
        await client.exec(`
            CREATE TABLE net_asset_ledger (id serial PRIMARY KEY, transaction_type varchar(50) NOT NULL, description text NOT NULL, amount numeric(12,2) DEFAULT '0' NOT NULL, net_asset_change numeric(12,2) DEFAULT '0' NOT NULL, affected_component varchar(50) NOT NULL, entity_type varchar(50), entity_id integer, transaction_date date NOT NULL, net_asset_after numeric(14,2), created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
            INSERT INTO net_asset_ledger (transaction_type, description, amount, affected_component, transaction_date, net_asset_after)
            VALUES ('order_payment', 'Recorded before snapshots existed', 500, 'cash', '2026-10-15', 1900000);
        `);
        await client.exec(await Bun.file(new URL("../drizzle/0015_difference_history.sql", import.meta.url)).text());

        // The client's demo on 16 Oct, as the ledger snapshots it after each step:
        // [type, amount, net assets, investment, profit, difference]
        const steps: [string, number, number, number, number, number][] = [
            ["investment", 1914554.42, 1914554.42, 1914554.42, 0, 0],
            ["pl_adjustment", 10000, 1924554.42, 1914554.42, 10000, 0],
            ["cash_withdrawal", 10000, 1914554.42, 1914554.42, 10000, -10000],
            ["order_payment", 3000, 1915554.42, 1914554.42, 11000, -10000],
            ["supplier_payment", 20000, 1935554.42, 1914554.42, 11000, 10000],
        ];
        for (const [type, amount, netAssets, investment, profit, difference] of steps) {
            await client.query(
                `INSERT INTO net_asset_ledger (transaction_type, description, amount, affected_component, transaction_date, net_asset_after, investment_balance_after, profit_after, difference_after)
                 VALUES ($1, $2, $3, 'test', '2026-10-16', $4, $5, $6, $7)`,
                [type, type, amount, netAssets, investment, profit, difference],
            );
        }
    });

    test("lists only transactions that moved the difference, newest first, with exact changes", async () => {
        const history = await getDifferenceHistory({}, database);

        expect(history.total).toBe(3);
        expect(history.entries.map((e) => [e.transactionType, e.change, e.difference])).toEqual([
            ["supplier_payment", 20000, 10000],
            ["cash_withdrawal", -10000, -10000],
            ["investment", null, 0], // first snapshot: the starting point
        ]);
        expect(history.entries[0]).toMatchObject({ netAssets: 1935554.42, investmentBalance: 1914554.42, profitLoss: 11000, transactionDate: "2026-10-16" });
    });

    test("pages through the history", async () => {
        const second = await getDifferenceHistory({ page: 2, limit: 2 }, database);
        expect(second).toMatchObject({ total: 3, totalPages: 2, page: 2 });
        expect(second.entries.map((e) => e.transactionType)).toEqual(["investment"]);
    });
});
