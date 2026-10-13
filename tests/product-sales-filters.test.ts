import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, asc } from "drizzle-orm";
import { wholesaleOrderItems } from "../src/db/schema";
import { buildProductSalesItemFilters } from "../src/modules/reports/product-sales-filters";
import { productWiseSalesQuerySchema } from "../src/modules/reports/validation";

// Real Postgres queries against isolated in-memory fixtures, never the configured database.
const client = new PGlite();
const db = drizzle(client, { schema: { wholesaleOrderItems } });

beforeAll(async () => {
    await client.exec(`
        CREATE TABLE wholesale_order_items (id integer PRIMARY KEY, brand_id integer, sr_id integer);
        INSERT INTO wholesale_order_items VALUES
            (1, 10, 101),   -- BD FOOD, SR 101
            (2, 10, 102),   -- BD FOOD, SR 102
            (3, 20, 201),   -- ACI, SR 201
            (4, 20, NULL),  -- ACI, DB Point
            (5, 10, NULL);  -- BD FOOD, DB Point
    `);
});
afterAll(async () => { await client.close(); });

async function matching(params: Record<string, string>) {
    const query = productWiseSalesQuerySchema.parse({ startDate: "2026-09-01", endDate: "2026-09-30", ...params });
    const rows = await db.select({ id: wholesaleOrderItems.id }).from(wholesaleOrderItems)
        .where(and(...buildProductSalesItemFilters(query)))
        .orderBy(asc(wholesaleOrderItems.id));
    return rows.map((row) => row.id);
}

test("no company or SR selection keeps every item", async () => {
    expect(await matching({})).toEqual([1, 2, 3, 4, 5]);
    expect(await matching({ brandIds: "", srIds: "" })).toEqual([1, 2, 3, 4, 5]);
});

test("filters by one or more companies", async () => {
    expect(await matching({ brandIds: "10" })).toEqual([1, 2, 5]);
    expect(await matching({ brandIds: "10,20" })).toEqual([1, 2, 3, 4, 5]);
});

test("filters by several SRs, with 0 selecting DB Point", async () => {
    expect(await matching({ srIds: "101,201" })).toEqual([1, 3]);
    expect(await matching({ srIds: "0" })).toEqual([4, 5]);
    expect(await matching({ srIds: "102,0" })).toEqual([2, 4, 5]);
});

test("company and SR selections narrow each other", async () => {
    expect(await matching({ brandIds: "10", srIds: "101" })).toEqual([1]);
    expect(await matching({ brandIds: "20", srIds: "0" })).toEqual([4]);
});

test("rejects malformed id lists", () => {
    const base = { startDate: "2026-09-01", endDate: "2026-09-30" };
    expect(productWiseSalesQuerySchema.safeParse({ ...base, srIds: "NaN" }).success).toBe(false);
    expect(productWiseSalesQuerySchema.safeParse({ ...base, brandIds: "0" }).success).toBe(false);
    expect(productWiseSalesQuerySchema.safeParse({ ...base, srIds: "1,,2" }).success).toBe(false);
});
