import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Applies the real migration to isolated fixtures, never the configured database.
const client = new PGlite();
const migration = readFileSync(join(import.meta.dir, "../drizzle/0012_restrict_collected_due_deletes.sql"), "utf8");

beforeAll(async () => {
    // Pre-migration shape: collections pointed at dues with ON DELETE SET NULL
    await client.exec(`
        CREATE TABLE wholesale_orders (id integer PRIMARY KEY);
        CREATE TABLE order_customer_dues (id integer PRIMARY KEY, order_id integer NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE);
        CREATE TABLE order_dsr_dues (id integer PRIMARY KEY, order_id integer NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE);
        CREATE TABLE order_sr_dues (id integer PRIMARY KEY, order_id integer NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE);
        CREATE TABLE due_collections (id integer PRIMARY KEY,
            customer_due_id integer CONSTRAINT due_collections_customer_due_id_order_customer_dues_id_fk REFERENCES order_customer_dues(id) ON DELETE SET NULL,
            order_id integer REFERENCES wholesale_orders(id) ON DELETE SET NULL);
        CREATE TABLE dsr_due_collections (id integer PRIMARY KEY,
            dsr_due_id integer CONSTRAINT dsr_due_collections_dsr_due_id_order_dsr_dues_id_fk REFERENCES order_dsr_dues(id) ON DELETE SET NULL,
            order_id integer REFERENCES wholesale_orders(id) ON DELETE SET NULL);
        CREATE TABLE sr_due_collections (id integer PRIMARY KEY,
            sr_due_id integer CONSTRAINT sr_due_collections_sr_due_id_order_sr_dues_id_fk REFERENCES order_sr_dues(id) ON DELETE SET NULL,
            order_id integer REFERENCES wholesale_orders(id) ON DELETE SET NULL);
        INSERT INTO wholesale_orders VALUES (1), (2), (3), (4);
        INSERT INTO order_customer_dues VALUES (10, 1), (11, 4);
        INSERT INTO order_dsr_dues VALUES (20, 2);
        INSERT INTO order_sr_dues VALUES (30, 3);
        INSERT INTO due_collections VALUES (100, 10, 1);
        INSERT INTO dsr_due_collections VALUES (200, 20, 2);
        INSERT INTO sr_due_collections VALUES (300, 30, 3);
    `);
    for (const statement of migration.split("--> statement-breakpoint")) {
        await client.exec(statement);
    }
});

afterAll(async () => {
    await client.close();
});

test("a due with collections can no longer be deleted directly", async () => {
    await expect(client.exec("DELETE FROM order_customer_dues WHERE id = 10")).rejects.toThrow("foreign key");
    await expect(client.exec("DELETE FROM order_dsr_dues WHERE id = 20")).rejects.toThrow("foreign key");
    await expect(client.exec("DELETE FROM order_sr_dues WHERE id = 30")).rejects.toThrow("foreign key");
});

test("deleting an order cannot cascade away its collected dues", async () => {
    for (const orderId of [1, 2, 3]) {
        await expect(client.exec(`DELETE FROM wholesale_orders WHERE id = ${orderId}`)).rejects.toThrow("foreign key");
    }
    const { rows } = await client.query<{ id: number; customer_due_id: number }>("SELECT id, customer_due_id FROM due_collections");
    expect(rows).toEqual([{ id: 100, customer_due_id: 10 }]);
});

test("dues without collections can still be removed", async () => {
    await client.exec("DELETE FROM wholesale_orders WHERE id = 4");
    const { rows } = await client.query("SELECT id FROM order_customer_dues WHERE id = 11");
    expect(rows).toEqual([]);
});
