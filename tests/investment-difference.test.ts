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
import { calculateInvestmentDifference } from "../src/modules/investment/service";

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
    const base = { investmentBalance: 200000, profitLoss: 1000, profitOnlyAdjustments: 0 };

    test("matches when net assets equal investment + profit", () => {
        expect(calculateInvestmentDifference({ ...base, netAssets: 201000 }).difference).toBe(0);
    });

    test("cash taken home shows as a minus difference", () => {
        expect(calculateInvestmentDifference({ ...base, netAssets: 190000 }).difference).toBe(-11000);
    });

    test("extra money paid online from home shows as a plus difference", () => {
        expect(calculateInvestmentDifference({ ...base, netAssets: 221000 }).difference).toBe(20000);
    });

    test("older profit-only adjustments do not create a difference", () => {
        // 7,500 of old adjustments are in profit but were never in net assets
        expect(calculateInvestmentDifference({ ...base, profitLoss: 8500, profitOnlyAdjustments: 7500, netAssets: 201000 }).difference).toBe(0);
    });

    test("rounds to paisa without a negative zero", () => {
        const result = calculateInvestmentDifference({ investmentBalance: 0.1, profitLoss: 0.2, profitOnlyAdjustments: 0, netAssets: 0.3 });
        expect(Object.is(result.difference, 0)).toBe(true);
    });
});
