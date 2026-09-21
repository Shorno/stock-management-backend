import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc } from "drizzle-orm";
import { orderExpenses } from "../src/db/schema";
import { buildDbPointCommissionFilter } from "../src/modules/sr-commission/commission-filters";

// Real Postgres queries against isolated fixtures, never the configured database.
const client = new PGlite();
const db = drizzle(client, { schema: { orderExpenses } });

beforeAll(async () => {
    await client.exec(`
        CREATE TABLE order_expenses (
            id integer PRIMARY KEY,
            order_id integer NOT NULL,
            sr_id integer,
            amount numeric NOT NULL,
            expense_type varchar(50) NOT NULL,
            note text,
            created_at timestamp NOT NULL,
            updated_at timestamp NOT NULL
        );
        INSERT INTO order_expenses VALUES
            (1, 10, NULL, 100, 'commission', NULL, '2026-09-20 10:00:00', '2026-09-20 10:00:00'),
            (2, 10, NULL, 200, 'transport', NULL, '2026-09-20 19:00:00', '2026-09-20 19:00:00'),
            (3, 11, NULL, 300, 'food', NULL, '2026-09-21 10:00:00', '2026-09-21 10:00:00'),
            (4, 11, NULL, 400, 'other', NULL, '2026-09-21 19:00:00', '2026-09-21 19:00:00'),
            (5, 12, 7,    500, 'commission', NULL, '2026-09-21 12:00:00', '2026-09-21 12:00:00');
    `);
});

afterAll(async () => { await client.close(); });

async function matching(startDate?: string, endDate?: string) {
    return db
        .select({ id: orderExpenses.id, type: orderExpenses.expenseType })
        .from(orderExpenses)
        .where(buildDbPointCommissionFilter({ startDate, endDate }))
        .orderBy(asc(orderExpenses.id));
}

test("DB Point commission includes every unassigned expense type and excludes assigned SR commission", async () => {
    expect(await matching()).toEqual([
        { id: 1, type: "commission" },
        { id: 2, type: "transport" },
        { id: 3, type: "food" },
        { id: 4, type: "other" },
    ]);
});

test("DB Point commission respects the requested date range", async () => {
    expect(await matching("2026-09-21", "2026-09-21")).toEqual([
        { id: 2, type: "transport" },
        { id: 3, type: "food" },
    ]);
});
