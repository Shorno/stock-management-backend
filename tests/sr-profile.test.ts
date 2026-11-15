import { beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import * as schema from "../src/db/schema";

// The SR service uses the shared db module; point it at an in-memory Postgres.
const client = new PGlite();
const database = drizzle(client, { schema });
mock.module("../src/db/config", () => ({ db: database }));

const { updateSrProfileSchema } = await import("../src/modules/sr/validation");
const srRoutes = (await import("../src/modules/sr/routes")).default;

const migrations = ["0018_hide_companies_srs.sql", "0019_sr_profile.sql", "0020_sr_many_companies.sql"];
async function runMigrations() {
    for (const file of migrations) {
        const sql = await Bun.file(new URL(`../drizzle/${file}`, import.meta.url)).text();
        for (const statement of sql.split("--> statement-breakpoint")) await client.exec(statement);
    }
}

beforeAll(async () => {
    // Tables as they are before migration 0018, then the real migration files on top.
    await client.exec(`
        CREATE TABLE brand (id serial PRIMARY KEY, name varchar(100) NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE sr (id serial PRIMARY KEY, name varchar(100) NOT NULL, brand_id integer REFERENCES brand(id) ON DELETE SET NULL,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        -- Stubs: migration 0020 adds brand_id to these.
        CREATE TABLE order_expenses (id serial PRIMARY KEY);
        CREATE TABLE sr_commissions (id serial PRIMARY KEY);
        CREATE TABLE audit_logs (id serial PRIMARY KEY, timestamp timestamp DEFAULT now() NOT NULL, user_id text, user_name text, user_role text,
            action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, entity_name text, old_value jsonb, new_value jsonb,
            ip_address text, user_agent text, metadata jsonb);
        -- Just the columns the SR stats query reads.
        CREATE TABLE wholesale_order_items (id serial PRIMARY KEY, order_id integer, sr_id integer, net numeric(12,2), total_quantity integer);
        CREATE TABLE order_item_returns (id serial PRIMARY KEY, order_item_id integer, return_amount numeric(12,2), adjustment_discount numeric(12,2), return_quantity integer);
        INSERT INTO brand (name) VALUES ('ACI Barisal');
        INSERT INTO sr (name, brand_id) VALUES ('Shawon', 1), ('Naeem', 1);
    `);
    await runMigrations();
}, 20000);

beforeEach(async () => {
    await client.exec(`
        TRUNCATE sr_documents, audit_logs RESTART IDENTITY;
        UPDATE sr SET phone = NULL, address = NULL, nid_number = NULL, emergency_contact = NULL, notes = NULL, profile_photo = NULL;
    `);
});

function appAs(role: string | null) {
    const app = new Hono();
    app.use("*", async (c, next) => {
        c.set("user" as never, (role ? { id: "u1", name: "U", role } : null) as never);
        await next();
    });
    app.route("/srs", srRoutes);
    return app;
}

const send = (app: Hono, method: string, path: string, body?: unknown) =>
    app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const doc = { documentType: "nid_front", documentName: "nid.jpg", documentUrl: "https://res.cloudinary.com/x/nid.jpg", publicId: "sr-documents/nid" };

test("the migration keeps existing SRs with empty profiles and can be re-run", async () => {
    const { rows } = await client.query<{ name: string; phone: string | null }>("SELECT name, phone FROM sr ORDER BY id");
    expect(rows).toEqual([{ name: "Shawon", phone: null }, { name: "Naeem", phone: null }]);
    await runMigrations();
});

test("phone numbers are checked and stored as 01XXXXXXXXX", () => {
    const parse = (phone: unknown) => updateSrProfileSchema.safeParse({ phone });
    expect(parse("01712-345678").data?.phone).toBe("01712345678");
    expect(parse("+8801712345678").data?.phone).toBe("01712345678");
    expect(parse("০১৭১২৩৪৫৬৭৮").data?.phone).toBe("01712345678");
    expect(parse("").data?.phone).toBeNull();
    expect(parse(null).data?.phone).toBeNull();
    expect(updateSrProfileSchema.parse({}).phone).toBeUndefined();
    expect(parse("12345").success).toBe(false);
    expect(parse("01212345678").success).toBe(false);
});

test("only admins can change a profile or touch documents", async () => {
    for (const [method, path, body] of [
        ["PATCH", "/srs/1/profile", { phone: "01712345678" }],
        ["GET", "/srs/1/documents", undefined],
        ["POST", "/srs/1/documents", doc],
        ["DELETE", "/srs/1/documents/1", undefined],
    ] as const) {
        expect((await send(appAs(null), method, path, body)).status).toBe(401);
        expect((await send(appAs("manager"), method, path, body)).status).toBe(403);
        expect((await send(appAs("dsr"), method, path, body)).status).toBe(403);
    }
});

test("an admin updates the profile; only sent fields change and it is audit logged", async () => {
    const first = await send(appAs("admin"), "PATCH", "/srs/1/profile", {
        phone: "01712 345678", address: "Barisal", nidNumber: "1234567890", notes: "Reliable",
    });
    expect(first.status).toBe(200);
    expect((await first.json()).data).toMatchObject({ phone: "01712345678", address: "Barisal", nidNumber: "1234567890", notes: "Reliable" });

    // Clearing one field leaves the others alone.
    const second = await send(appAs("super_admin"), "PATCH", "/srs/1/profile", { notes: "" });
    expect((await second.json()).data).toMatchObject({ phone: "01712345678", address: "Barisal", notes: null });

    const { rows } = await client.query<{ action: string; event: string; old_value: unknown; new_value: unknown }>(
        "SELECT action, metadata->>'event' AS event, old_value, new_value FROM audit_logs ORDER BY id");
    expect(rows.map((r) => r.event)).toEqual(["sr_profile_updated", "sr_profile_updated"]);
    expect(rows[1]!.old_value).toEqual({ notes: "Reliable" });
    expect(rows[1]!.new_value).toEqual({ notes: null });
});

test("a bad phone number or unknown SR is rejected", async () => {
    const bad = await send(appAs("admin"), "PATCH", "/srs/1/profile", { phone: "123" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toContain("Bangladeshi mobile");
    expect((await send(appAs("admin"), "PATCH", "/srs/999/profile", { phone: "01712345678" })).status).toBe(404);
    expect((await send(appAs("admin"), "PATCH", "/srs/abc/profile", {})).status).toBe(400);
});

test("non-admins see the phone but not the private profile details", async () => {
    await send(appAs("admin"), "PATCH", "/srs/1/profile", { phone: "01712345678", address: "Barisal", nidNumber: "999", emergencyContact: "Wife", notes: "x" });

    for (const path of ["/srs/1", "/srs?search=Shawon", "/srs/1/stats"]) {
        const asManager = await (await appAs("manager").request(path)).json();
        const row = path.endsWith("stats") ? asManager.data.sr : Array.isArray(asManager.data) ? asManager.data[0] : asManager.data;
        expect(row.phone).toBe("01712345678");
        for (const field of ["address", "nidNumber", "emergencyContact", "notes"]) expect(row).not.toHaveProperty(field);
    }
    const asAdmin = await (await appAs("admin").request("/srs/1")).json();
    expect(asAdmin.data).toMatchObject({ address: "Barisal", nidNumber: "999", emergencyContact: "Wife" });
});

test("documents can be added, listed and deleted, but only through their own SR", async () => {
    const added = await send(appAs("admin"), "POST", "/srs/1/documents", doc);
    expect(added.status).toBe(201);
    const { data: created } = await added.json();
    expect(created).toMatchObject({ srId: 1, documentType: "nid_front", documentName: "nid.jpg" });

    expect((await (await appAs("admin").request("/srs/1/documents")).json()).data).toHaveLength(1);
    expect((await (await appAs("admin").request("/srs/2/documents")).json()).data).toHaveLength(0);

    // Another SR's URL cannot delete it.
    expect((await send(appAs("admin"), "DELETE", `/srs/2/documents/${created.id}`)).status).toBe(404);
    expect((await send(appAs("admin"), "DELETE", `/srs/1/documents/${created.id}`)).status).toBe(200);
    expect((await (await appAs("admin").request("/srs/1/documents")).json()).data).toHaveLength(0);

    const { rows } = await client.query<{ event: string; entity_id: string }>(
        "SELECT metadata->>'event' AS event, entity_id FROM audit_logs ORDER BY id");
    expect(rows).toEqual([{ event: "sr_document_added", entity_id: "1" }, { event: "sr_document_deleted", entity_id: "1" }]);
});

test("document input is validated and the SR must exist", async () => {
    expect((await send(appAs("admin"), "POST", "/srs/1/documents", { ...doc, documentType: "passport" })).status).toBe(400);
    expect((await send(appAs("admin"), "POST", "/srs/1/documents", { ...doc, documentUrl: "not a url" })).status).toBe(400);
    expect((await send(appAs("admin"), "POST", "/srs/999/documents", doc)).status).toBe(404);
});

test("deleting an SR removes its documents", async () => {
    await client.exec("INSERT INTO sr (name) VALUES ('Temp')");
    await send(appAs("admin"), "POST", "/srs/3/documents", doc);
    await client.exec("DELETE FROM sr WHERE id = 3");
    const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM sr_documents");
    expect(rows[0]!.n).toBe(0);
});
