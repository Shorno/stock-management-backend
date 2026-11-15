import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import * as schema from "../src/db/schema";

// The whole schema in an in-memory Postgres, so real order, settlement and report code runs.
const client = new PGlite();
const database = drizzle(client, { schema });
// PGlite has one connection. Order code runs a few lookups on `db` while inside a
// transaction (fine on a real pool, a deadlock here), so run transactions on that
// one connection: same commit/rollback behaviour, no lock wait.
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

const { createSr, updateSr, getSrs, getSrById, setSrActive } = await import("../src/modules/sr/service");
const { getSrsQuerySchema } = await import("../src/modules/sr/validation");
const { setBrandActive } = await import("../src/modules/brand/service");
const { createOrder, updateOrder, saveOrderAdjustment, getOrderAdjustment } = await import("../src/modules/wholesale/service");
const { createOrderSchema, saveAdjustmentSchema } = await import("../src/modules/wholesale/validation");
const { getSrWiseSales } = await import("../src/modules/reports/service");
const { createCommission, getCommissions } = await import("../src/modules/sr-commission/service");
const srRoutes = (await import("../src/modules/sr/routes")).default;

const ACI = 1, BD_FOOD = 2, OLD_CO = 3;
const ACI_SALT = 1, BD_NOODLES = 2; // products, batches and variants share these ids
let shawon: number; // works for ACI and BD Food
let naeem: number;  // works for ACI only

beforeAll(async () => {
    const { pushSchema } = await import("drizzle-kit/api");
    await (await pushSchema(schema, database as never)).apply();
}, 60000);

beforeEach(async () => {
    const { rows } = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    await client.exec(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await client.exec(`
        INSERT INTO unit (name, abbreviation, multiplier, is_base) VALUES ('Piece', 'PCS', 1, true);
        INSERT INTO category (name) VALUES ('Food');
        INSERT INTO brand (name) VALUES ('ACI'), ('BD Food'), ('Old Co');
        INSERT INTO product (code, name, category_id, brand_id) VALUES ('A1', 'ACI Salt', 1, 1), ('B1', 'BD Noodles', 1, 2);
        INSERT INTO product_variant (product_id, variant_type, label) VALUES (1, 'pack', '1kg'), (2, 'pack', '1 pack');
        INSERT INTO stock_batch (variant_id, supplier_price, sell_price, initial_quantity, remaining_quantity)
            VALUES (1, 8, 10, 1000, 1000), (2, 15, 20, 1000, 1000);
        INSERT INTO dsr (name) VALUES ('Rahim');
        INSERT INTO route (name) VALUES ('Sadar');
        INSERT INTO "user" (id, name, email) VALUES ('u', 'Admin', 'admin@example.test');
    `);
    shawon = (await createSr({ name: "Shawon", brandIds: [BD_FOOD, ACI] })).id;
    naeem = (await createSr({ name: "Naeem", brandIds: [ACI] })).id;
});

const line = (product: number, srId: number | undefined, quantity = 10) => ({
    productId: product, batchId: product, brandId: product === ACI_SALT ? ACI : BD_FOOD,
    quantity, unit: "PCS", totalQuantity: quantity, salePrice: product === ACI_SALT ? 10 : 20, srId,
});
const order = (lines: ReturnType<typeof line>[]) =>
    createOrderSchema.parse({ dsrId: 1, routeId: 1, orderDate: "2026-11-10", items: lines });
const adjustment = (input: Record<string, unknown>) =>
    saveAdjustmentSchema.parse({ paymentDate: "2026-11-11", ...input });

describe("SR companies", () => {
    test("an SR keeps several companies; the first one is mirrored for older readers", async () => {
        const sr = await getSrById(shawon);
        expect(sr!.brands.map((b) => b.name)).toEqual(["ACI", "BD Food"]);
        expect(sr!.brandId).toBe(BD_FOOD);
        expect(sr!.brand?.name).toBe("BD Food");

        const updated = await updateSr(shawon, { name: "Shawon", brandIds: [ACI] });
        expect(updated!.brands.map((b) => b.id)).toEqual([ACI]);
        expect(updated!.brandId).toBe(ACI);

        // An old client that only sends brandId still works.
        const legacy = await updateSr(naeem, { name: "Naeem", brandId: BD_FOOD });
        expect(legacy!.brands.map((b) => b.id)).toEqual([BD_FOOD]);
        const none = await updateSr(naeem, { name: "Naeem" });
        expect(none!.brands).toEqual([]);
        expect(none!.brandId).toBeNull();
    });

    test("filtering by company finds every SR that works for it", async () => {
        const names = async (q: Record<string, string>) => (await getSrs(getSrsQuerySchema.parse(q))).srs.map((s) => s.name);
        expect(await names({ brandId: String(ACI) })).toEqual(["Naeem", "Shawon"]);
        expect(await names({ brandId: String(BD_FOOD) })).toEqual(["Shawon"]);
        expect(await names({ brandId: String(OLD_CO) })).toEqual([]);
    });

    test("an SR is hidden from pickers only when all of their companies are hidden", async () => {
        const picker = async () => (await getSrs(getSrsQuerySchema.parse({ activeOnly: "true" }))).srs.map((s) => s.name);
        await setBrandActive(ACI, false);
        expect(await picker()).toEqual(["Shawon"]);
        await setBrandActive(BD_FOOD, false);
        expect(await picker()).toEqual([]);
        await setBrandActive(ACI, true);
        await setSrActive(naeem, false);
        expect(await picker()).toEqual(["Shawon"]);
    });

    test("the API rejects unknown companies and accepts a list", async () => {
        const app = new Hono();
        app.use("*", async (c, next) => { c.set("user" as never, { id: "u", name: "U", role: "admin" } as never); await next(); });
        app.route("/srs", srRoutes);
        const post = (body: unknown) => app.request("/srs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

        const bad = await post({ name: "X", brandIds: [ACI, 999] });
        expect(bad.status).toBe(400);
        expect((await bad.json()).message).toContain("not found");
        expect(await getSrs(getSrsQuerySchema.parse({ search: "X" }))).toMatchObject({ total: 0 }); // nothing half-created

        const ok = await post({ name: "Rubel", brandIds: [OLD_CO, ACI, ACI] });
        expect(ok.status).toBe(201);
        expect((await ok.json()).data.brands.map((b: { id: number }) => b.id)).toEqual([ACI, OLD_CO]);
    });
});

describe("orders", () => {
    test("each line's SR must work for that line's company", async () => {
        await expect(createOrder(order([line(BD_NOODLES, naeem)]))).rejects.toThrow('SR "Naeem" does not work for "BD Food"');
        const created = await createOrder(order([line(ACI_SALT, naeem), line(BD_NOODLES, shawon), line(ACI_SALT, shawon), line(BD_NOODLES, undefined)]));
        expect(created.items).toHaveLength(4);
    });

    test("an old order still saves after the SR stops working for a company, but new pairs are checked", async () => {
        const created = await createOrder(order([line(ACI_SALT, naeem)]));
        await updateSr(naeem, { name: "Naeem", brandIds: [OLD_CO] });

        // Same SR/company pair as before: allowed (quantity changed).
        const edited = await updateOrder(created.id, order([line(ACI_SALT, naeem, 12)]));
        expect(edited?.items[0]?.totalQuantity).toBe(12);

        // A pair that was not on the order: checked.
        await expect(updateOrder(created.id, order([line(ACI_SALT, naeem), line(BD_NOODLES, naeem)])))
            .rejects.toThrow('SR "Naeem" does not work for "BD Food"');
    });
});

describe("settlement commission", () => {
    async function mixedOrder() {
        return createOrder(order([line(ACI_SALT, shawon), line(BD_NOODLES, shawon), line(ACI_SALT, naeem)]));
    }

    test("an SR who sold for two companies must have the commission's company chosen", async () => {
        const o = await mixedOrder();
        await expect(saveOrderAdjustment(o.id, adjustment({ expenses: [{ type: "commission", amount: 50, srId: shawon }] })))
            .rejects.toThrow("Choose which company the commission is for");
        await expect(saveOrderAdjustment(o.id, adjustment({ expenses: [{ type: "commission", amount: 50, srId: shawon, brandId: OLD_CO }] })))
            .rejects.toThrow("no products from that company");
        await expect(saveOrderAdjustment(o.id, adjustment({ expenses: [{ type: "transport", amount: 50, brandId: ACI }] })))
            .rejects.toThrow("only be chosen for an SR commission");
    });

    test("the chosen company is saved on the expense and the SR commission, and filled in for one-company SRs", async () => {
        const o = await mixedOrder();
        await saveOrderAdjustment(o.id, adjustment({
            expenses: [
                { type: "commission", amount: 30, srId: shawon, brandId: BD_FOOD },
                { type: "commission", amount: 20, srId: shawon, brandId: ACI },
                { type: "commission", amount: 10, srId: naeem },
                { type: "transport", amount: 5 },
            ],
        }));

        const { rows } = await client.query<{ sr_id: number; brand_id: number | null; amount: string }>(
            "SELECT sr_id, brand_id, amount FROM sr_commissions ORDER BY id");
        expect(rows.map((r) => [r.sr_id, r.brand_id, Number(r.amount)])).toEqual([[shawon, BD_FOOD, 30], [shawon, ACI, 20], [naeem, ACI, 10]]);

        const view = await getOrderAdjustment(o.id);
        expect(view!.expenses.map((e) => [e.srId ?? null, e.brandName ?? null])).toEqual([
            [shawon, "BD Food"], [shawon, "ACI"], [naeem, "ACI"], [null, null],
        ]);

        // Commission list shows the company too.
        const list = await getCommissions(shawon, {});
        expect(list.commissions.map((c) => c.brandName).sort()).toEqual(["ACI", "BD Food"]);
    });

    test("SR dues list every company the SR works for", async () => {
        const o = await mixedOrder();
        await saveOrderAdjustment(o.id, adjustment({ srDues: [{ srId: shawon, amount: 40 }] }));
        const view = await getOrderAdjustment(o.id);
        expect(view!.srDues[0]?.brandName).toBe("ACI, BD Food");
    });
});

describe("manual commission", () => {
    test("must be for one of the SR's companies; filled in when the SR has one", async () => {
        const base = { amount: 100, commissionDate: "2026-11-12" };
        expect(await createCommission({ ...base, srId: shawon })).toMatchObject({ success: false, message: "Choose which company this commission is for" });
        expect(await createCommission({ ...base, srId: shawon, brandId: OLD_CO })).toMatchObject({ success: false });
        expect(await createCommission({ ...base, srId: shawon, brandId: ACI })).toMatchObject({ success: true });
        expect(await createCommission({ ...base, srId: naeem })).toMatchObject({ success: true });
        const { rows } = await client.query<{ sr_id: number; brand_id: number }>("SELECT sr_id, brand_id FROM sr_commissions ORDER BY id");
        expect(rows).toEqual([{ sr_id: shawon, brand_id: ACI }, { sr_id: naeem, brand_id: ACI }]);
    });
});

describe("SR Sales report", () => {
    test("has one row per SR and company sold, with commission on the right row", async () => {
        const o = await createOrder(order([line(ACI_SALT, shawon, 10), line(BD_NOODLES, shawon, 5), line(ACI_SALT, naeem, 3)]));
        await saveOrderAdjustment(o.id, adjustment({
            expenses: [
                { type: "commission", amount: 30, srId: shawon, brandId: BD_FOOD },
                { type: "commission", amount: 10, srId: naeem },
            ],
        }));
        // An old commission saved before companies were recorded: goes to Naeem's only row.
        await client.query("INSERT INTO sr_commissions (sr_id, amount, commission_date, source_type) VALUES ($1, 7, '2026-11-10', 'manual')", [naeem]);

        const report = await getSrWiseSales({});
        const rows = report.items.map((i) => [i.srName, i.brandName, Number(i.salesPriceTotal), Number(i.commissionTotal)])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
        expect(rows).toEqual([
            ["Naeem", "ACI", 30, 17],
            ["Shawon", "ACI", 100, 0],
            ["Shawon", "BD Food", 100, 30],
        ]);
        expect(report.summary.totalSRs).toBe(2);
        expect(Number(report.summary.grandCommissionTotal)).toBe(47);
    });

    test("uses the company on the order line even after the SR's companies change", async () => {
        const o = await createOrder(order([line(BD_NOODLES, shawon, 5)]));
        await saveOrderAdjustment(o.id, adjustment({}));
        await updateSr(shawon, { name: "Shawon", brandIds: [ACI] });
        const report = await getSrWiseSales({});
        expect(report.items.map((i) => i.brandName)).toEqual(["BD Food"]);
    });
});

describe("migration 0020", () => {
    test("links every SR to its current company and can be re-run", async () => {
        await client.exec(`
            INSERT INTO sr (name, brand_id) VALUES ('Legacy', 3);
            DELETE FROM sr_brands WHERE sr_id = ${naeem};
        `);
        const sql = await Bun.file(new URL("../drizzle/0020_sr_many_companies.sql", import.meta.url)).text();
        for (const statement of sql.split("--> statement-breakpoint")) await client.exec(statement);
        for (const statement of sql.split("--> statement-breakpoint")) await client.exec(statement);
        const { rows } = await client.query<{ name: string; brands: string }>(`
            SELECT s.name, string_agg(l.brand_id::text, ',' ORDER BY l.brand_id) AS brands
            FROM sr s JOIN sr_brands l ON l.sr_id = s.id GROUP BY s.name ORDER BY s.name`);
        expect(rows).toEqual([
            { name: "Legacy", brands: "3" },
            { name: "Naeem", brands: "1" },
            { name: "Shawon", brands: "1,2" },
        ]);
    });

    test("the optional backfill fills in a company only where it is certain", async () => {
        const o = await createOrder(order([line(ACI_SALT, shawon), line(BD_NOODLES, shawon), line(ACI_SALT, naeem)]));
        await saveOrderAdjustment(o.id, adjustment({
            expenses: [
                { type: "commission", amount: 30, srId: shawon, brandId: BD_FOOD },
                { type: "commission", amount: 10, srId: naeem },
            ],
        }));
        // Pretend these were saved before companies were recorded.
        await client.exec(`
            UPDATE order_expenses SET brand_id = NULL; UPDATE sr_commissions SET brand_id = NULL;
            INSERT INTO sr_commissions (sr_id, amount, commission_date, source_type) VALUES (${naeem}, 5, '2026-11-01', 'manual'), (${shawon}, 5, '2026-11-01', 'manual');
        `);
        const sql = await Bun.file(new URL("../drizzle/0020_backfill_commission_company.sql", import.meta.url)).text();
        for (const statement of sql.split("--> statement-breakpoint")) await client.exec(statement);

        const { rows } = await client.query<{ sr_id: number; order_id: number | null; brand_id: number | null }>(
            "SELECT sr_id, order_id, brand_id FROM sr_commissions ORDER BY id");
        expect(rows).toEqual([
            { sr_id: shawon, order_id: o.id, brand_id: null }, // sold for two companies: left alone
            { sr_id: naeem, order_id: o.id, brand_id: ACI },
            { sr_id: naeem, order_id: null, brand_id: ACI },   // manual, one company
            { sr_id: shawon, order_id: null, brand_id: null }, // manual, two companies
        ]);
        const expenses = await client.query<{ sr_id: number; brand_id: number | null }>(
            "SELECT sr_id, brand_id FROM order_expenses ORDER BY id");
        expect(expenses.rows).toEqual([{ sr_id: shawon, brand_id: null }, { sr_id: naeem, brand_id: ACI }]);
    });
});
