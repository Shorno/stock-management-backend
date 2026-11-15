import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import * as schema from "../src/db/schema";

// The whole schema in an in-memory Postgres, so real order, settlement and report code runs.
const client = new PGlite();
const database = drizzle(client, { schema });
// PGlite has one connection; run transactions on it directly (see sr-many-companies.test.ts).
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

const { createSr, getSrById, updateSrProfile, addSrDocument, getSrDocuments } = await import("../src/modules/sr/service");
const { mergeSrs } = await import("../src/modules/sr/merge");
const { createOrder, saveOrderAdjustment, getOrderAdjustment, updateOrder } = await import("../src/modules/wholesale/service");
const { createOrderSchema, saveAdjustmentSchema } = await import("../src/modules/wholesale/validation");
const { getSrWiseSales } = await import("../src/modules/reports/service");
const { createCommission, getCommissions } = await import("../src/modules/sr-commission/service");
const srRoutes = (await import("../src/modules/sr/routes")).default;

const ACI = 1, BD_FOOD = 2;
const ACI_SALT = 1, BD_NOODLES = 2; // products, batches and variants share these ids
// The same person, added once per company: the situation the merge is for.
let shawonAci: number;
let shawonBd: number;
let naeem: number;
let orderId: number;

beforeAll(async () => {
    const { pushSchema } = await import("drizzle-kit/api");
    await (await pushSchema(schema, database as never)).apply();
}, 60000);

const line = (product: number, srId: number | undefined, quantity = 10) => ({
    productId: product, batchId: product, brandId: product === ACI_SALT ? ACI : BD_FOOD,
    quantity, unit: "PCS", totalQuantity: quantity, salePrice: product === ACI_SALT ? 10 : 20, srId,
});
const order = (lines: ReturnType<typeof line>[]) =>
    createOrderSchema.parse({ dsrId: 1, routeId: 1, orderDate: "2026-11-10", items: lines });
const adjustment = (input: Record<string, unknown>) =>
    saveAdjustmentSchema.parse({ paymentDate: "2026-11-11", ...input });
const count = async (sql: string, params: unknown[] = []) =>
    Number((await client.query<{ n: number }>(sql, params)).rows[0]!.n);

beforeEach(async () => {
    const { rows } = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    await client.exec(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await client.exec(`
        INSERT INTO unit (name, abbreviation, multiplier, is_base) VALUES ('Piece', 'PCS', 1, true);
        INSERT INTO category (name) VALUES ('Food');
        INSERT INTO brand (name) VALUES ('ACI'), ('BD Food');
        INSERT INTO product (code, name, category_id, brand_id) VALUES ('A1', 'ACI Salt', 1, 1), ('B1', 'BD Noodles', 1, 2);
        INSERT INTO product_variant (product_id, variant_type, label) VALUES (1, 'pack', '1kg'), (2, 'pack', '1 pack');
        INSERT INTO stock_batch (variant_id, supplier_price, sell_price, initial_quantity, remaining_quantity)
            VALUES (1, 8, 10, 1000, 1000), (2, 15, 20, 1000, 1000);
        INSERT INTO dsr (name) VALUES ('Rahim');
        INSERT INTO route (name) VALUES ('Sadar');
        INSERT INTO "user" (id, name, email) VALUES ('u', 'Admin', 'admin@example.test');
    `);
    shawonAci = (await createSr({ name: "Shawon", brandIds: [ACI] })).id;
    shawonBd = (await createSr({ name: "Shawon ", brandIds: [BD_FOOD] })).id;
    naeem = (await createSr({ name: "Naeem", brandIds: [ACI] })).id;

    // One order where each duplicate sold for their own company, and Naeem sold too.
    orderId = (await createOrder(order([line(ACI_SALT, shawonAci, 10), line(BD_NOODLES, shawonBd, 5), line(ACI_SALT, naeem, 3)]))).id;
    await saveOrderAdjustment(orderId, adjustment({
        expenses: [
            { type: "commission", amount: 30, srId: shawonAci },
            { type: "commission", amount: 20, srId: shawonBd },
            { type: "commission", amount: 5, srId: naeem },
        ],
        srDues: [{ srId: shawonAci, amount: 40 }, { srId: shawonBd, amount: 25 }],
    }));
    // 10 of the BD Food duplicate's due already collected.
    await client.query(`UPDATE order_sr_dues SET collected_amount = 10 WHERE sr_id = $1`, [shawonBd]);
    await client.query(`INSERT INTO sr_due_collections (sr_due_id, sr_id, order_id, amount, collection_date)
        SELECT id, sr_id, order_id, 10, '2026-11-12' FROM order_sr_dues WHERE sr_id = $1`, [shawonBd]);
    await createCommission({ srId: shawonBd, amount: 100, commissionDate: "2026-11-12" });
    await client.query(`INSERT INTO opening_balances (type, entity_id, entity_name, amount, balance_date, note) VALUES
        ('sr_due', $1, 'Shawon', 500, '2026-01-01', 'old book'), ('sr_due', $2, 'Shawon ', 300, '2025-12-01', null)`, [shawonAci, shawonBd]);
    await updateSrProfile(shawonAci, { address: "Sadar Road" });
    await updateSrProfile(shawonBd, { phone: "01711111111", address: "Somewhere else" });
    await addSrDocument(shawonBd, { documentType: "photo", documentName: "Photo", documentUrl: "https://example.test/p.jpg" });
});

describe("merging duplicate SRs", () => {
    test("preview reports what would move and changes nothing", async () => {
        const preview = await mergeSrs(shawonAci, [shawonBd], { preview: true });
        expect(preview).toMatchObject({
            kept: { id: shawonAci, name: "Shawon" },
            merged: [{ id: shawonBd, name: "Shawon " }],
            moved: { orderLines: 1, orderExpenses: 1, damageItems: 0, srDues: 1, dueCollections: 1, commissions: 2, documents: 1 },
            companyIds: [ACI, BD_FOOD],
            addedCompanyIds: [BD_FOOD],
            filledProfileFields: ["phone"],
            openingDue: { before: 500, after: 800 },
        });
        expect(await getSrById(shawonBd)).toBeDefined();
        expect(await count("SELECT count(*)::int AS n FROM wholesale_order_items WHERE sr_id = $1", [shawonBd])).toBe(1);
        expect(await count("SELECT count(*)::int AS n FROM opening_balances")).toBe(2);
    });

    test("moves everything to the kept SR, who then works for both companies", async () => {
        await mergeSrs(shawonAci, [shawonBd]);

        expect(await getSrById(shawonBd)).toBeUndefined();
        const kept = await getSrById(shawonAci);
        expect(kept!.brands.map((b) => b.name)).toEqual(["ACI", "BD Food"]);
        expect(kept!.brandId).toBe(ACI); // main company unchanged
        // Kept SR's details win; only empty ones are filled from the duplicate.
        expect(kept!.address).toBe("Sadar Road");
        expect(kept!.phone).toBe("01711111111");
        expect((await getSrDocuments(shawonAci)).map((d) => d.documentName)).toEqual(["Photo"]);

        for (const table of ["wholesale_order_items", "order_expenses", "order_sr_dues", "sr_due_collections", "sr_commissions", "sr_documents", "sr_brands"]) {
            expect(await count(`SELECT count(*)::int AS n FROM ${table} WHERE sr_id = $1`, [shawonBd])).toBe(0);
        }

        // Each commission keeps its company, so they stay split per company.
        const commissions = await getCommissions(shawonAci, {});
        expect(commissions.commissions.map((c) => [Number(c.amount), c.brandName]).sort()).toEqual([[100, "BD Food"], [20, "BD Food"], [30, "ACI"]]);

        // One opening due for the person: amounts added, earliest date kept.
        const { rows } = await client.query<{ entity_id: number; entity_name: string; amount: string; balance_date: string; note: string }>(
            "SELECT entity_id, entity_name, amount, balance_date::text, note FROM opening_balances");
        expect(rows).toEqual([{ entity_id: shawonAci, entity_name: "Shawon", amount: "800.00", balance_date: "2025-12-01", note: "old book" }]);
    });

    test("the settlement still edits cleanly: both dues kept, collections intact", async () => {
        await mergeSrs(shawonAci, [shawonBd]);
        const view = await getOrderAdjustment(orderId);
        expect(view!.srDues.map((d) => [d.srId, d.amount, d.collectedAmount])).toEqual([[shawonAci, 40, 0], [shawonAci, 25, 10]]);
        expect(view!.expenses.map((e) => [e.srId, e.amount, e.brandName]).sort((a, b) => Number(b[1]) - Number(a[1])))
            .toEqual([[shawonAci, 30, "ACI"], [shawonAci, 20, "BD Food"], [naeem, 5, "ACI"]]);

        // Re-save exactly what the page loaded.
        await saveOrderAdjustment(orderId, adjustment({
            expenses: view!.expenses.map((e) => ({ type: e.type, amount: e.amount, srId: e.srId, brandId: e.brandId })),
            srDues: view!.srDues.map((d) => ({ dueId: d.dueId, srId: d.srId, amount: d.amount })),
        }));
        const again = await getOrderAdjustment(orderId);
        expect(again!.srDues.map((d) => [d.amount, d.collectedAmount])).toEqual([[40, 0], [25, 10]]);
        expect(await count("SELECT count(*)::int AS n FROM sr_due_collections WHERE sr_due_id IS NOT NULL")).toBe(1);

        // The order itself still saves: the kept SR now works for BD Food.
        const edited = await updateOrder(orderId, order([line(ACI_SALT, shawonAci, 10), line(BD_NOODLES, shawonAci, 6), line(ACI_SALT, naeem, 3)]));
        expect(edited?.items).toHaveLength(3);
    });

    test("the SR Sales report shows one person with a row per company", async () => {
        await mergeSrs(shawonAci, [shawonBd]);
        const report = await getSrWiseSales({});
        const rows = report.items.map((i) => [i.srName, i.brandName, Number(i.salesPriceTotal), Number(i.commissionTotal)])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
        expect(rows).toEqual([
            ["Naeem", "ACI", 30, 5],
            ["Shawon", "ACI", 100, 30],
            ["Shawon", "BD Food", 100, 120],
        ]);
        expect(report.summary.totalSRs).toBe(2);
    });

    test("an opening due only on the duplicate moves to the kept SR", async () => {
        await client.query("DELETE FROM opening_balances WHERE entity_id = $1", [shawonAci]);
        const result = await mergeSrs(shawonAci, [shawonBd]);
        expect(result.openingDue).toEqual({ before: 0, after: 300 });
        const { rows } = await client.query<{ entity_id: number; entity_name: string }>("SELECT entity_id, entity_name FROM opening_balances");
        expect(rows).toEqual([{ entity_id: shawonAci, entity_name: "Shawon" }]);
    });

    test("rejects bad requests without changing anything", async () => {
        await expect(mergeSrs(shawonAci, [shawonAci])).rejects.toThrow("cannot be merged into itself");
        await expect(mergeSrs(shawonAci, [])).rejects.toThrow("at least one");
        await expect(mergeSrs(999, [shawonBd])).rejects.toThrow("SR to keep was not found");
        await expect(mergeSrs(shawonAci, [shawonBd, 999])).rejects.toThrow("SR not found: #999");
        expect(await getSrById(shawonBd)).toBeDefined();
        expect(await count("SELECT count(*)::int AS n FROM sr_brands WHERE sr_id = $1", [shawonAci])).toBe(1);
    });
});

describe("merge API", () => {
    const appAs = (role: string) => {
        const app = new Hono();
        app.use("*", async (c, next) => { c.set("user" as never, { id: "u", name: "Admin", role } as never); await next(); });
        app.route("/srs", srRoutes);
        return (id: number, body: unknown) => app.request(`/srs/${id}/merge`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        });
    };

    test("admins only; previews, merges and writes the audit log", async () => {
        expect((await appAs("manager")(shawonAci, { sourceIds: [shawonBd] })).status).toBe(403);

        const merge = appAs("admin");
        const preview = await merge(shawonAci, { sourceIds: [shawonBd], preview: true });
        expect(preview.status).toBe(200);
        expect((await preview.json()).data.moved.orderLines).toBe(1);
        expect(await count("SELECT count(*)::int AS n FROM audit_logs")).toBe(0);

        const done = await merge(shawonAci, { sourceIds: [shawonBd] });
        expect(done.status).toBe(200);
        expect((await done.json()).message).toBe("Merged 1 SR into Shawon");
        const { rows } = await client.query<{ action: string; entity_id: string; metadata: { event: string } }>(
            "SELECT action, entity_id::text, metadata FROM audit_logs ORDER BY id");
        expect(rows.map((r) => [r.action, Number(r.entity_id), r.metadata.event])).toEqual([
            ["UPDATE", shawonAci, "sr_merged"], ["DELETE", shawonBd, "sr_merged_into"],
        ]);

        const bad = await merge(shawonAci, { sourceIds: [shawonAci] });
        expect(bad.status).toBe(400);
        expect((await bad.json()).message).toContain("cannot be merged into itself");
    });
});
