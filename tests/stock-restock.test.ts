import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { db as applicationDb } from "../src/db/config";
import { createStockAdjustment } from "../src/modules/stock-adjustments/service";
import { createStockAdjustmentSchema, type CreateStockAdjustmentInput } from "../src/modules/stock-adjustments/validation";
import { createStockBatch, deleteStockBatch } from "../src/modules/stock-batch/service";
import { getStockPurchaseValue } from "../src/modules/stock-batch/purchase-history";
import { getBrandWisePurchases } from "../src/modules/reports/service";

// Every service call is explicitly given this in-memory Postgres database.
// No service in these tests queries the configured application database.
const client = new PGlite();
const fixtureDb = drizzle(client, { schema });
const database = fixtureDb as unknown as typeof applicationDb;

beforeAll(async () => {
    await client.exec(`
        CREATE TABLE category (id serial PRIMARY KEY, name varchar(100) NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE brand (id serial PRIMARY KEY, name varchar(100) NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE product (id serial PRIMARY KEY, code varchar(50) NOT NULL, name text NOT NULL, category_id integer REFERENCES category(id), brand_id integer REFERENCES brand(id), low_stock_threshold integer DEFAULT 10, image_url text, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE product_variant (id serial PRIMARY KEY, product_id integer REFERENCES product(id), sku varchar(50), variant_type varchar(50) NOT NULL, label varchar(100) NOT NULL, value numeric, unit varchar(20), is_default boolean DEFAULT false, is_active boolean DEFAULT true, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE stock_batch (id serial PRIMARY KEY, variant_id integer REFERENCES product_variant(id), supplier_price numeric(12,6) NOT NULL, sell_price numeric(12,6) NOT NULL, initial_quantity integer NOT NULL, remaining_quantity integer NOT NULL CHECK (remaining_quantity >= 0), initial_free_qty integer DEFAULT 0 NOT NULL, remaining_free_qty integer DEFAULT 0 NOT NULL CHECK (remaining_free_qty >= 0), unit varchar(20) DEFAULT 'PCS', is_opening_stock boolean DEFAULT false NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE stock_adjustments (id serial PRIMARY KEY, batch_id integer REFERENCES stock_batch(id) ON DELETE SET NULL, variant_id integer REFERENCES product_variant(id), adjustment_type varchar(50) NOT NULL, quantity integer NOT NULL, free_quantity integer DEFAULT 0 NOT NULL, order_id integer, return_id integer, note text, created_by integer, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE supplier_purchases (id serial PRIMARY KEY, brand_id integer REFERENCES brand(id), amount numeric(12,2) NOT NULL, purchase_date date NOT NULL, description text, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE supplier_payments (id serial PRIMARY KEY, brand_id integer REFERENCES brand(id), amount numeric(12,2) NOT NULL, payment_date date NOT NULL, payment_method varchar(50), from_cash_balance boolean DEFAULT false NOT NULL, is_damage_credit boolean DEFAULT false NOT NULL, note text, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
    `);
    // Exercise the actual additive migration, including its purchase-reversal foreign key.
    await client.exec(await Bun.file(new URL("../drizzle/0013_link_stock_batch_purchases.sql", import.meta.url)).text());
}, 20000);

beforeEach(async () => {
    await client.exec(`
        TRUNCATE category, brand, product, product_variant, stock_batch, stock_adjustments, supplier_purchases, supplier_payments RESTART IDENTITY CASCADE;
        INSERT INTO category (name) VALUES ('Category');
        INSERT INTO brand (name) VALUES ('Company');
        INSERT INTO product (code, name, category_id, brand_id) VALUES ('P1', 'Product', 1, 1);
        INSERT INTO product_variant (product_id, variant_type, label, unit) VALUES (1, 'pack', 'Standard', 'PCS'), (1, 'pack', 'Other variant', 'PCS');
        INSERT INTO stock_batch (variant_id, supplier_price, sell_price, initial_quantity, remaining_quantity, initial_free_qty, remaining_free_qty, unit)
        VALUES (1, 100, 120, 100, 20, 10, 2, 'BOX'), (2, 200, 250, 50, 0, 5, 0, 'PCS');
        INSERT INTO supplier_payments (brand_id, amount, payment_date, from_cash_balance) VALUES (1, 500, '2026-10-13', true);
    `);
});

afterAll(async () => { await client.close(); });

const restock = (overrides: Partial<CreateStockAdjustmentInput> = {}) => createStockAdjustment({
    batchId: 1, variantId: 1, adjustmentType: "restock", quantity: 10, freeQuantity: 3, ...overrides,
}, undefined, database);

async function batch(id = 1) {
    const [row] = await fixtureDb.select().from(schema.stockBatch).where(eq(schema.stockBatch.id, id));
    return row!;
}

async function purchases() {
    return fixtureDb.select().from(schema.supplierPurchases).orderBy(schema.supplierPurchases.id);
}

test("normal restock preserves the batch and prices, adds paid/free stock, and charges only paid stock to the company", async () => {
    const before = await batch();
    const untouched = await batch(2);
    const paymentsBefore = await fixtureDb.select().from(schema.supplierPayments);
    const result = await restock();
    expect(result).toMatchObject({ success: true, stockValueChange: 1000, purchaseAmount: 1000, netAssetChange: 0 });
    expect(await batch()).toMatchObject({
        id: before.id, initialQuantity: 110, remainingQuantity: 30, initialFreeQty: 13, remainingFreeQty: 5,
        supplierPrice: before.supplierPrice, sellPrice: before.sellPrice, unit: before.unit,
        createdAt: before.createdAt, isOpeningStock: before.isOpeningStock,
    });
    expect(await batch(2)).toEqual(untouched);
    expect(await fixtureDb.select().from(schema.stockBatch)).toHaveLength(2);
    expect(await purchases()).toMatchObject([{ stockBatchId: 1, brandId: 1, amount: "1000.00" }]);
    expect(await fixtureDb.select().from(schema.supplierPayments)).toEqual(paymentsBefore);
    expect(await fixtureDb.select().from(schema.stockAdjustments)).toMatchObject([{ batchId: 1, adjustmentType: "restock", quantity: 10, freeQuantity: 3 }]);
});

test("a restock has the same purchasing effect as adding a new batch with the same quantities and prices", async () => {
    await restock();
    const newBatch = await createStockBatch(1, {
        supplierPrice: 100, sellPrice: 120, quantity: 10, freeQuantity: 3, unit: "BOX", isOpeningStock: false,
    }, database);
    const rows = await purchases();
    expect(rows).toHaveLength(2);
    expect(rows.map(row => [row.brandId, row.amount, row.purchaseDate])).toEqual([
        [1, "1000.00", rows[0]!.purchaseDate], [1, "1000.00", rows[0]!.purchaseDate],
    ]);
    expect(rows[1]!.stockBatchId).toBe(newBatch.id);
    expect(newBatch).toMatchObject({ initialQuantity: 10, remainingQuantity: 10, initialFreeQty: 3, remainingFreeQty: 3 });
});

test("fractional buying prices are kept intact and supplier amounts use database currency rounding", async () => {
    await fixtureDb.update(schema.stockBatch).set({ supplierPrice: "1.005000" }).where(eq(schema.stockBatch.id, 1));
    expect(await restock({ quantity: 1, freeQuantity: 0 })).toMatchObject({ success: true, purchaseAmount: 1.01 });
    expect(await purchases()).toMatchObject([{ amount: "1.01" }]);
    expect((await batch()).supplierPrice).toBe("1.005000");
});

test("return restock restores only available stock without another purchase or cash payment", async () => {
    const paymentsBefore = await fixtureDb.select().from(schema.supplierPayments);
    const result = await restock({ adjustmentType: "return_restock" });
    expect(result).toMatchObject({ success: true, stockValueChange: 1000, purchaseAmount: 0, netAssetChange: 1000 });
    expect(await batch()).toMatchObject({ initialQuantity: 100, remainingQuantity: 30, initialFreeQty: 10, remainingFreeQty: 5 });
    expect(await purchases()).toEqual([]);
    expect(await fixtureDb.select().from(schema.supplierPayments)).toEqual(paymentsBefore);
});

test("several restocks accumulate on the same batch and do not change already-sold quantities", async () => {
    await restock();
    await restock({ quantity: 4, freeQuantity: 1 });
    const row = await batch();
    expect(row).toMatchObject({ initialQuantity: 114, remainingQuantity: 34, initialFreeQty: 14, remainingFreeQty: 6 });
    expect(row.initialQuantity - row.remainingQuantity).toBe(80);
    expect(await purchases()).toHaveLength(2);
});

test("restocking a depleted batch uses its own price", async () => {
    expect(await restock({ batchId: 2, variantId: 2 })).toMatchObject({ success: true, purchaseAmount: 2000 });
    expect(await batch(2)).toMatchObject({ initialQuantity: 60, remainingQuantity: 10 });
    expect(await batch()).toMatchObject({ initialQuantity: 100, remainingQuantity: 20 });
});

test("restocking an opening batch is a new purchase and keeps its original opening-stock flag", async () => {
    await fixtureDb.update(schema.stockBatch).set({ isOpeningStock: true }).where(eq(schema.stockBatch.id, 1));
    await restock();
    expect(await batch()).toMatchObject({ isOpeningStock: true, remainingQuantity: 30 });
    expect(await purchases()).toMatchObject([{ stockBatchId: 1, amount: "1000.00" }]);
    await deleteStockBatch(1, database);
    expect(await purchases()).toEqual([]);
});

test("supplier purchase failures roll back both inventory and the adjustment history", async () => {
    const before = await batch();
    await client.exec("ALTER TABLE supplier_purchases ADD CONSTRAINT reject_test_purchase CHECK (amount < 100)");
    try {
        await expect(restock()).rejects.toThrow();
        expect(await batch()).toEqual(before);
        expect(await purchases()).toEqual([]);
        expect(await fixtureDb.select().from(schema.stockAdjustments)).toEqual([]);
    } finally {
        await client.exec("ALTER TABLE supplier_purchases DROP CONSTRAINT reject_test_purchase");
    }
});

test("new batch creation also rolls back when its supplier purchase fails", async () => {
    await client.exec("ALTER TABLE supplier_purchases ADD CONSTRAINT reject_new_purchase CHECK (amount < 100)");
    try {
        await expect(createStockBatch(1, { supplierPrice: 100, sellPrice: 120, quantity: 10, freeQuantity: 0, unit: "PCS", isOpeningStock: false }, database)).rejects.toThrow();
        expect(await fixtureDb.select().from(schema.stockBatch)).toHaveLength(2);
    } finally {
        await client.exec("ALTER TABLE supplier_purchases DROP CONSTRAINT reject_new_purchase");
    }
});

test("missing or mismatched batches cannot alter stock or supplier balances", async () => {
    expect(await restock({ batchId: 999 })).toMatchObject({ success: false });
    expect(await restock({ batchId: 2 })).toMatchObject({ success: false });
    expect(await batch()).toMatchObject({ initialQuantity: 100, remainingQuantity: 20 });
    expect(await purchases()).toEqual([]);
});

describe.each(["restock", "return_restock"] as const)("%s input validation", adjustmentType => {
    test.each([
        { batchId: undefined }, { batchId: 0 }, { quantity: 0 }, { quantity: -1 },
        { quantity: 1.5 }, { freeQuantity: -1 }, { freeQuantity: 1.5 },
    ])("rejects invalid input %j before changing data", async invalid => {
        const input = { batchId: 1, variantId: 1, adjustmentType, quantity: 10, freeQuantity: 0, ...invalid };
        expect(createStockAdjustmentSchema.safeParse(input).success).toBe(false);
        expect(await createStockAdjustment(input as CreateStockAdjustmentInput, undefined, database)).toMatchObject({ success: false });
        expect(await batch()).toMatchObject({ initialQuantity: 100, remainingQuantity: 20 });
        expect(await purchases()).toEqual([]);
    });
});

test("existing manual adjustments remain inventory-only and cannot make free stock negative", async () => {
    expect(await restock({ adjustmentType: "manual", quantity: 2, freeQuantity: 0 })).toMatchObject({ success: true, purchaseAmount: 0 });
    expect(await batch()).toMatchObject({ initialQuantity: 100, remainingQuantity: 22 });
    expect(await restock({ adjustmentType: "manual", quantity: -1, freeQuantity: -3 })).toMatchObject({ success: false });
    expect(await batch()).toMatchObject({ remainingQuantity: 22, remainingFreeQty: 2 });
    expect(await purchases()).toEqual([]);
});

test("deleting a restocked legacy batch reverses its original purchase and linked restocks only", async () => {
    await fixtureDb.insert(schema.supplierPurchases).values([
        { brandId: 1, amount: "10000.00", purchaseDate: "2026-10-13", description: "Stock batch: Product (Standard) - 100 units @ ৳100" },
        { brandId: 1, amount: "10000.00", purchaseDate: "2026-10-13", description: "Stock batch: Unrelated product" },
    ]);
    await restock();
    await restock({ quantity: 5 });
    expect(await deleteStockBatch(1, database)).toBe(true);
    expect(await purchases()).toMatchObject([{ amount: "10000.00", description: "Stock batch: Unrelated product" }]);
    expect(await batch(2)).toBeDefined();
});

test("deleting a new batch reverses its linked original purchase and all subsequent restocks", async () => {
    const created = await createStockBatch(1, { supplierPrice: 100, sellPrice: 120, quantity: 10, freeQuantity: 0, unit: "PCS", isOpeningStock: false }, database);
    await restock({ batchId: created.id });
    expect(await purchases()).toHaveLength(2);
    expect(await deleteStockBatch(created.id, database)).toBe(true);
    expect(await purchases()).toEqual([]);
    expect(await fixtureDb.select().from(schema.stockBatch)).toHaveLength(2);
});

test("purchase reports keep original receipts and later restocks on their own dates without counting returns", async () => {
    await fixtureDb.update(schema.stockBatch).set({ createdAt: new Date("2026-09-01T12:00:00Z") });
    const first = await restock();
    const second = await restock({ quantity: 4, freeQuantity: 1 });
    const returned = await restock({ adjustmentType: "return_restock", quantity: 3, freeQuantity: 1 });
    if (!first.success || !second.success || !returned.success) throw new Error("Fixture restock failed");
    await fixtureDb.update(schema.stockAdjustments).set({ createdAt: new Date("2026-10-13T23:59:59.999Z") })
        .where(eq(schema.stockAdjustments.id, first.adjustmentId));
    await fixtureDb.update(schema.stockAdjustments).set({ createdAt: new Date("2026-10-14T00:00:00Z") })
        .where(eq(schema.stockAdjustments.id, second.adjustmentId));

    expect(await getStockPurchaseValue(database, { startDate: "2026-09-01", endDate: "2026-09-30" })).toBe(20000);
    expect(await getStockPurchaseValue(database, { startDate: "2026-10-13", endDate: "2026-10-13" })).toBe(1000);
    expect(await getStockPurchaseValue(database, { startDate: "2026-10-14", endDate: "2026-10-14" })).toBe(400);
    expect(await getStockPurchaseValue(database, { endDate: "2026-09-30" })).toBe(20000);
    expect(await getStockPurchaseValue(database)).toBe(21400);

    const report = await getBrandWisePurchases({ startDate: "2026-10-13", endDate: "2026-10-13" }, database);
    expect(report.summary).toMatchObject({ totalQuantity: 10, grandTotal: "1000.00" });
    expect(report.items[0]?.products[0]).toMatchObject({ totalQuantity: 10, totalFreeQty: 3, totalCost: "1000.00", batchCount: 1 });
    const allTime = await getBrandWisePurchases({}, database);
    expect(allTime.items[0]?.products[0]).toMatchObject({ totalQuantity: 164, totalFreeQty: 19, totalCost: "21400.00", batchCount: 2 });
});
