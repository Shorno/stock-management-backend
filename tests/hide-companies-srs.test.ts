import { beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import * as schema from "../src/db/schema";

// The company/SR/product services use the shared db module; point it at an in-memory Postgres.
const client = new PGlite();
const database = drizzle(client, { schema });
mock.module("../src/db/config", () => ({ db: database }));

const { getBrands, setBrandActive } = await import("../src/modules/brand/service");
const { getSrs, setSrActive } = await import("../src/modules/sr/service");
const { getProducts } = await import("../src/modules/products/service");
const { getBrandsQuerySchema } = await import("../src/modules/brand/validation");
const { getSrsQuerySchema } = await import("../src/modules/sr/validation");
const { getProductsQuerySchema } = await import("../src/modules/products/validation");
const brandRoutes = (await import("../src/modules/brand/routes")).default;
const srRoutes = (await import("../src/modules/sr/routes")).default;

beforeAll(async () => {
    // Tables as they are before migration 0018, then the real migration file on top.
    await client.exec(`
        CREATE TABLE category (id serial PRIMARY KEY, name varchar(100) NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE brand (id serial PRIMARY KEY, name varchar(100) NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE product (id serial PRIMARY KEY, code varchar(50) NOT NULL, name text NOT NULL, category_id integer REFERENCES category(id),
            brand_id integer NOT NULL REFERENCES brand(id) ON DELETE CASCADE, low_stock_threshold integer DEFAULT 10, image_url text,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE product_variant (id serial PRIMARY KEY, product_id integer REFERENCES product(id), sku varchar(50), variant_type varchar(50) NOT NULL,
            label varchar(100) NOT NULL, value numeric, unit varchar(20), is_default boolean DEFAULT false, is_active boolean DEFAULT true,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE stock_batch (id serial PRIMARY KEY, variant_id integer REFERENCES product_variant(id), supplier_price numeric(12,6) NOT NULL,
            sell_price numeric(12,6) NOT NULL, initial_quantity integer NOT NULL, remaining_quantity integer NOT NULL, initial_free_qty integer DEFAULT 0 NOT NULL,
            remaining_free_qty integer DEFAULT 0 NOT NULL, unit varchar(20) DEFAULT 'PCS', is_opening_stock boolean DEFAULT false NOT NULL,
            purchase_id integer, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE sr (id serial PRIMARY KEY, name varchar(100) NOT NULL, brand_id integer REFERENCES brand(id) ON DELETE SET NULL,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE audit_logs (id serial PRIMARY KEY, timestamp timestamp DEFAULT now() NOT NULL, user_id text, user_name text, user_role text,
            action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, entity_name text, old_value jsonb, new_value jsonb,
            ip_address text, user_agent text, metadata jsonb);
        INSERT INTO brand (name) VALUES ('ACI Barisal'), ('BD Food');
        INSERT INTO sr (name, brand_id) VALUES ('Shawon', 1), ('Naeem', 2), ('Godown', NULL);
    `);
    // 0019 (SR profile) comes after; the SR service reads its columns too.
    for (const file of ["0018_hide_companies_srs.sql", "0019_sr_profile.sql"]) {
        const migration = await Bun.file(new URL(`../drizzle/${file}`, import.meta.url)).text();
        for (const statement of migration.split("--> statement-breakpoint")) await client.exec(statement);
    }
}, 20000);

beforeEach(async () => {
    await client.exec(`
        UPDATE brand SET is_active = true;
        UPDATE sr SET is_active = true;
        TRUNCATE category, product, product_variant, stock_batch, audit_logs RESTART IDENTITY CASCADE;
        INSERT INTO category (name) VALUES ('Food');
        INSERT INTO product (code, name, category_id, brand_id) VALUES ('A1', 'ACI Salt', 1, 1), ('B1', 'BD Noodles', 1, 2);
    `);
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

test("the migration leaves every existing company and SR active", async () => {
    const { rows } = await client.query<{ n: number }>(
        "SELECT (SELECT count(*) FROM brand WHERE NOT is_active) + (SELECT count(*) FROM sr WHERE NOT is_active) AS n");
    expect(Number(rows[0]!.n)).toBe(0);
    // Re-running is a no-op (IF NOT EXISTS).
    const migration = await Bun.file(new URL("../drizzle/0018_hide_companies_srs.sql", import.meta.url)).text();
    for (const statement of migration.split("--> statement-breakpoint")) await client.exec(statement);
});

test("a hidden company drops out of pickers with its products and SRs, but lists still return it", async () => {
    await setBrandActive(1, false);

    const pick = getBrandsQuerySchema.parse({ activeOnly: "true" });
    expect(names((await getBrands(pick)).brands)).toEqual(["BD Food"]);
    expect(names((await getBrands(getBrandsQuerySchema.parse({}))).brands)).toEqual(["ACI Barisal", "BD Food"]);

    const products = await getProducts(getProductsQuerySchema.parse({ activeOnly: "true" }));
    expect(names(products.products)).toEqual(["BD Noodles"]);
    expect(products.total).toBe(1);
    expect((await getProducts(getProductsQuerySchema.parse({}))).products).toHaveLength(2);

    // Shawon's company is hidden; the SR with no company stays.
    expect(names((await getSrs(getSrsQuerySchema.parse({ activeOnly: "true" }))).srs)).toEqual(["Godown", "Naeem"]);
    expect((await getSrs(getSrsQuerySchema.parse({}))).srs).toHaveLength(3);
});

test("showing the company again brings everything back", async () => {
    await setBrandActive(1, false);
    await setBrandActive(1, true);
    expect((await getBrands(getBrandsQuerySchema.parse({ activeOnly: "true" }))).brands).toHaveLength(2);
    expect((await getProducts(getProductsQuerySchema.parse({ activeOnly: "true" }))).products).toHaveLength(2);
    expect((await getSrs(getSrsQuerySchema.parse({ activeOnly: "true" }))).srs).toHaveLength(3);
});

test("a hidden SR drops out of SR pickers only", async () => {
    const hidden = await setSrActive(2, false);
    expect(hidden?.isActive).toBe(false);
    expect(hidden?.brand?.name).toBe("BD Food");
    expect(names((await getSrs(getSrsQuerySchema.parse({ activeOnly: "true" }))).srs)).toEqual(["Godown", "Shawon"]);
    // The SR's company and its products are unaffected.
    expect((await getProducts(getProductsQuerySchema.parse({ activeOnly: "true", brandId: "2" }))).products).toHaveLength(1);
    // Filtering by company in a picker respects the hidden SR too.
    expect((await getSrs(getSrsQuerySchema.parse({ activeOnly: "true", brandId: "2" }))).srs).toHaveLength(0);
});

test("hiding an unknown company or SR finds nothing", async () => {
    expect(await setBrandActive(999, false)).toBeUndefined();
    expect(await setSrActive(999, false)).toBeUndefined();
});

// ---------- routes ----------

function appAs(role: string | null) {
    const app = new Hono();
    app.use("*", async (c, next) => {
        c.set("user" as never, (role ? { id: "u1", name: "U", role } : null) as never);
        await next();
    });
    app.route("/brands", brandRoutes);
    app.route("/srs", srRoutes);
    return app;
}

const send = (app: Hono, method: string, path: string, body: unknown) =>
    app.request(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test.each(["/brands/1/active", "/srs/1/active"])("only admins can hide or show (%s)", async (path) => {
    expect((await send(appAs(null), "PATCH", path, { isActive: false })).status).toBe(401);
    expect((await send(appAs("manager"), "PATCH", path, { isActive: false })).status).toBe(403);
    expect((await send(appAs("dsr"), "PATCH", path, { isActive: false })).status).toBe(403);
    expect((await send(appAs("admin"), "PATCH", path, { isActive: "no" })).status).toBe(400);

    const hidden = await send(appAs("super_admin"), "PATCH", path, { isActive: false });
    expect(hidden.status).toBe(200);
    expect((await hidden.json()).data.isActive).toBe(false);
    const shown = await send(appAs("admin"), "PATCH", path, { isActive: true });
    expect((await shown.json()).data.isActive).toBe(true);

    // Both changes are in the audit log, with who did it.
    const { rows } = await client.query<{ action: string; user_role: string; event: string }>(
        "SELECT action, user_role, metadata->>'event' AS event FROM audit_logs ORDER BY id");
    expect(rows.map((r) => r.action)).toEqual(["STATUS_CHANGE", "STATUS_CHANGE"]);
    expect(rows.map((r) => r.user_role)).toEqual(["super_admin", "admin"]);
    expect(rows[0]!.event).toMatch(/_hidden$/);
    expect(rows[1]!.event).toMatch(/_shown$/);
});

test.each(["/brands/999/active", "/srs/999/active"])("hiding a missing record is a 404 (%s)", async (path) => {
    expect((await send(appAs("admin"), "PATCH", path, { isActive: false })).status).toBe(404);
});

test.each(["/brands", "/srs"])("creating (%s) now needs admin or manager", async (path) => {
    expect((await send(appAs(null), "POST", path, { name: "X" })).status).toBe(401);
    expect((await send(appAs("dsr"), "POST", path, { name: "X" })).status).toBe(403);
});

test("the list endpoints accept ?activeOnly=true", async () => {
    await setSrActive(1, false);
    const res = await appAs("manager").request("/srs?activeOnly=true");
    expect(res.status).toBe(200);
    expect(names((await res.json()).data)).toEqual(["Godown", "Naeem"]);
});
