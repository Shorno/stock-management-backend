import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { count, sum } from "drizzle-orm";
import { wholesaleOrders, wholesaleOrderItems } from "../src/db/schema";
import { buildOrderFilters } from "../src/modules/wholesale/order-filters";
import { getOrdersQuerySchema } from "../src/modules/wholesale/validation";

// Real Postgres queries against isolated in-memory fixtures, never the configured database.
const client = new PGlite();
const db = drizzle(client, { schema: { wholesaleOrders, wholesaleOrderItems } });

beforeAll(async () => {
    await client.exec(`
        CREATE TABLE wholesale_orders (
            id integer PRIMARY KEY, order_number text, dsr_id integer, route_id integer,
            category_id integer, brand_id integer, order_date date, status text, total numeric
        );
        CREATE TABLE wholesale_order_items (id integer PRIMARY KEY, order_id integer, sr_id integer);
        INSERT INTO wholesale_orders VALUES
            (1, 'WO-001', 10, 1, 1, 1, '2026-09-01', 'pending', 100),
            (2, 'WO-002', 20, 1, 1, 1, '2026-09-19', 'adjusted', 200),
            (3, 'WO-003', 30, 1, 1, 1, '2026-09-20', 'pending', 300),
            (4, 'WO-004', 10, 1, 1, 1, '2026-08-31', 'pending', 400),
            (5, 'WO-005', 10, 1, 1, 1, '2026-09-10', 'pending', 500),
            (6, 'WO-006', 20, 1, 1, 1, '2026-09-11', 'pending', 600);
        INSERT INTO wholesale_order_items VALUES
            (1, 1, 101), (2, 1, 101), (3, 1, 102), (4, 2, 102),
            (5, 3, 103), (6, 4, 101), (7, 5, NULL), (8, 6, 101);
    `);
});
afterAll(async () => { await client.close(); });

async function matching(input: Record<string, string>) {
    const query = getOrdersQuerySchema.parse(input);
    const where = buildOrderFilters(query);
    // Match the production relational query as well as the separate count query.
    const orders = await db.query.wholesaleOrders.findMany({
        columns: { id: true, total: true }, where,
        orderBy: (orders, { asc }) => [asc(orders.id)], limit: query.limit, offset: query.offset,
    });
    const [summary] = await db.select({ count: count(), total: sum(wholesaleOrders.total) }).from(wholesaleOrders).where(where);
    return { ids: orders.map(order => order.id), summary };
}

test("single and multiple SRs match their order items without duplicating orders or totals", async () => {
    expect(await matching({ srIds: "101" })).toEqual({ ids: [1, 4, 6], summary: { count: 3, total: "1100" } });
    expect(await matching({ srIds: "101,102" })).toEqual({ ids: [1, 2, 4, 6], summary: { count: 4, total: "1300" } });
});

test("single and multiple DSRs match the order's assigned DSR", async () => {
    expect((await matching({ dsrIds: "20" })).ids).toEqual([2, 6]);
    expect((await matching({ dsrIds: "10,20" })).ids).toEqual([1, 2, 4, 5, 6]);
    expect((await matching({ dsrId: "20" })).ids).toEqual([2, 6]);
});

test("SR and DSR groups intersect with inclusive dates, search and status", async () => {
    const filters = { srIds: "101,102", dsrIds: "10,20", startDate: "2026-09-01", endDate: "2026-09-19" };
    expect(await matching(filters)).toEqual({ ids: [1, 2, 6], summary: { count: 3, total: "900" } });
    expect((await matching({ ...filters, status: "pending" })).ids).toEqual([1, 6]);
    expect((await matching({ ...filters, search: "002" })).ids).toEqual([2]);
    expect((await matching({ srIds: "103", dsrIds: "10,20" })).ids).toEqual([]);
});

test("pagination changes rows but preserves the full matching count and amount", async () => {
    expect(await matching({ srIds: "101,102", dsrIds: "10,20", limit: "1", offset: "1" }))
        .toEqual({ ids: [2], summary: { count: 4, total: "1300" } });
});

test("unknown people return no matches and empty selections remove the people constraints", async () => {
    expect((await matching({ srIds: "999" })).ids).toEqual([]);
    expect((await matching({ dsrIds: "999" })).ids).toEqual([]);
    expect((await matching({ srIds: "", dsrIds: "" })).ids).toEqual([1, 2, 3, 4, 5, 6]);
});

test("validates and deduplicates people IDs before building a query", () => {
    const query = getOrdersQuerySchema.parse({ srIds: "101,102,101", dsrIds: "20,20" });
    expect(query.srIds).toEqual([101, 102]);
    expect(query.dsrIds).toEqual([20]);
    for (const value of ["0", "-1", "1.5", "1,,2", "abc", "2147483648", "1);drop table sr;"]) {
        expect(getOrdersQuerySchema.safeParse({ srIds: value }).success).toBe(false);
        expect(getOrdersQuerySchema.safeParse({ dsrIds: value }).success).toBe(false);
    }
});
