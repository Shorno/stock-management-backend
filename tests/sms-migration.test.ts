import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Applies the real migration to isolated fixtures, never the configured database.
const client = new PGlite();
const migration = readFileSync(join(import.meta.dir, "../drizzle/0016_sms_notifications.sql"), "utf8");

beforeAll(async () => {
    await client.exec(`
        CREATE TABLE customer (id integer PRIMARY KEY);
        CREATE TABLE wholesale_orders (id integer PRIMARY KEY);
        CREATE TABLE due_collections (id integer PRIMARY KEY);
        CREATE TABLE "user" (id text PRIMARY KEY);
        INSERT INTO customer VALUES (1);
        INSERT INTO wholesale_orders VALUES (5);
        INSERT INTO "user" VALUES ('u1');
    `);
    for (const statement of migration.split("--> statement-breakpoint")) {
        await client.exec(statement);
    }
});

afterAll(async () => {
    await client.close();
});

test("settings row defaults to SMS turned off", async () => {
    const { rows } = await client.query<{ enabled: boolean; overdue_days: number }>(
        "INSERT INTO sms_settings DEFAULT VALUES RETURNING enabled, overdue_days");
    expect(rows).toEqual([{ enabled: false, overdue_days: 30 }]);
});

test("logs survive deleting the customer, order and user they point to", async () => {
    await client.exec(`
        INSERT INTO sms_logs (customer_id, phone, message, type, status, order_id, sent_by_user_id)
        VALUES (1, '8801712345678', 'hi', 'settlement', 'sent', 5, 'u1');
        DELETE FROM customer WHERE id = 1;
        DELETE FROM wholesale_orders WHERE id = 5;
        DELETE FROM "user" WHERE id = 'u1';
    `);
    const { rows } = await client.query("SELECT customer_id, order_id, sent_by_user_id, segments FROM sms_logs");
    expect(rows).toEqual([{ customer_id: null, order_id: null, sent_by_user_id: null, segments: 1 }]);
});
