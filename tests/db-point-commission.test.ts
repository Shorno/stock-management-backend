import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, eq } from "drizzle-orm";
import { orderExpenses, srCommissions, wholesaleOrders } from "../src/db/schema";
import {
    buildDbPointCommissionFilter,
    buildSrCommissionFilter,
} from "../src/modules/sr-commission/commission-filters";
import {
    summarizeExpenseCommissionEntries,
    type ExpenseCommissionEntry,
} from "../src/modules/reports/expense-commission-model";

// Real Postgres queries against isolated fixtures, never the configured database.
const client = new PGlite();
const db = drizzle(client, { schema: { orderExpenses, srCommissions, wholesaleOrders } });

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
        CREATE TABLE wholesale_orders (id integer PRIMARY KEY, route_id integer NOT NULL, order_date date NOT NULL);
        CREATE TABLE sr_commissions (
            id integer PRIMARY KEY,
            sr_id integer NOT NULL,
            amount numeric NOT NULL,
            commission_date date NOT NULL,
            source_type varchar(30) NOT NULL,
            order_id integer,
            order_expense_id integer,
            note text,
            created_at timestamp NOT NULL,
            updated_at timestamp NOT NULL
        );
        INSERT INTO wholesale_orders VALUES
            (10, 1, '2026-09-18'),
            (11, 2, '2026-09-21'),
            (12, 1, '2026-09-21');
        INSERT INTO order_expenses VALUES
            (1, 10, NULL, 100, 'commission', NULL, '2026-09-20 10:00:00', '2026-09-20 10:00:00'),
            (2, 10, NULL, 200, 'transport', NULL, '2026-09-20 19:00:00', '2026-09-20 19:00:00'),
            (3, 11, NULL, 300, 'food', NULL, '2026-09-21 10:00:00', '2026-09-21 10:00:00'),
            (4, 11, NULL, 400, 'other', NULL, '2026-09-21 19:00:00', '2026-09-21 19:00:00'),
            (5, 12, 7,    500, 'commission', NULL, '2026-09-21 12:00:00', '2026-09-21 12:00:00');
        INSERT INTO sr_commissions VALUES
            (1, 7, 100, '2026-09-20', 'order_adjustment', 10, 1, NULL, '2026-09-20', '2026-09-20'),
            (2, 7, 200, '2026-09-21', 'manual', NULL, NULL, NULL, '2026-09-21', '2026-09-21'),
            (3, 8, 300, '2026-09-22', 'order_adjustment', 11, 3, NULL, '2026-09-22', '2026-09-22');
    `);
});

afterAll(async () => { await client.close(); });

async function matching(startDate?: string, endDate?: string, routeId?: number) {
    return db
        .select({ id: orderExpenses.id, type: orderExpenses.expenseType })
        .from(orderExpenses)
        .innerJoin(wholesaleOrders, eq(orderExpenses.orderId, wholesaleOrders.id))
        .where(buildDbPointCommissionFilter({ startDate, endDate, routeId }))
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
        { id: 3, type: "food" },
        { id: 4, type: "other" },
    ]);
});

test("DB Point commission follows the selected order route", async () => {
    expect(await matching(undefined, undefined, 2)).toEqual([
        { id: 3, type: "food" },
        { id: 4, type: "other" },
    ]);
});

test("assigned adjustment commission uses the challan date while manual commission keeps its selected date", async () => {
    const rows = await db
        .select({ id: srCommissions.id })
        .from(srCommissions)
        .leftJoin(wholesaleOrders, eq(srCommissions.orderId, wholesaleOrders.id))
        .where(buildSrCommissionFilter(undefined, {
            startDate: "2026-09-21",
            endDate: "2026-09-21",
        }))
        .orderBy(asc(srCommissions.id));

    expect(rows).toEqual([{ id: 2 }, { id: 3 }]);
});

test("expense report totals do not double-count assigned order commission", () => {
    const base = {
        attributionDate: "2026-09-21",
        dsrId: 2,
        dsrName: "DSR",
        orderId: 10,
        orderNumber: "INV-10",
        routeId: 1,
        routeName: "Route",
        note: null,
    };
    const entries: ExpenseCommissionEntry[] = [
        { ...base, id: "expense-1", source: "order_expense", ownerType: "db_point", srId: null, srName: "DB Point", expenseType: "transport", amount: "100.00" },
        { ...base, id: "expense-2", source: "order_expense", ownerType: "sr", srId: 7, srName: "SR 7", expenseType: "commission", amount: "200.00" },
        { ...base, id: "manual-3", source: "manual_commission", ownerType: "sr", srId: 7, srName: "SR 7", dsrId: null, dsrName: null, orderId: null, orderNumber: null, routeId: null, routeName: null, expenseType: "manual_commission", amount: "50.00" },
    ];

    expect(summarizeExpenseCommissionEntries(entries)).toEqual({
        totalAmount: "350.00",
        orderExpenseTotal: "300.00",
        srCommissionTotal: "250.00",
        dbPointCommissionTotal: "100.00",
        manualCommissionTotal: "50.00",
        entryCount: 3,
        orderCount: 1,
    });
});
