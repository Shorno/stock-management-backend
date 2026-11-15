import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db/config";

/**
 * Cash ledger: every movement that the dashboard's Cash Balance counts, one dated row each,
 * with the balance after it. It is built from the source tables on every request (nothing is
 * stored), so it can never drift from the dashboard number.
 *
 * The rules are exactly those of getCurrentCashBalance / getDashboardStats (no date range):
 *   + opening cash balance            opening_balances (type 'cash')   balance_date
 *   + order payments at settlement    order_payments                   payment_date
 *   + customer due collections        due_collections                  collection_date
 *   + DSR due collections             dsr_due_collections              collection_date
 *   + SR due collections              sr_due_collections               collection_date
 *   − supplier payments from cash     supplier_payments (from_cash_balance = true)   payment_date
 *   − cash withdrawals                cash_withdrawals                 withdrawal_date
 *   − bills                           bills                            bill_date
 * Anything else (order expenses, purchases, investments, DSR loans, P&L adjustments, damage
 * claims) does not touch the dashboard's cash, so it is not here either.
 */

export const CASH_LEDGER_TYPES = [
    "opening_cash",
    "order_payment",
    "due_collection",
    "dsr_due_collection",
    "sr_due_collection",
    "supplier_payment",
    "cash_withdrawal",
    "bill",
] as const;

export type CashLedgerType = (typeof CASH_LEDGER_TYPES)[number];

export interface CashLedgerQuery {
    startDate?: string;
    endDate?: string;
    types?: CashLedgerType[];
    page?: number;
    limit?: number;
    order?: "asc" | "desc";
}

export interface CashLedgerEntry {
    /** Unique within the ledger: `${type}-${sourceId}` */
    key: string;
    type: CashLedgerType;
    sourceId: number;
    date: string;
    /** Positive = money in, negative = money out */
    amount: number;
    moneyIn: number;
    moneyOut: number;
    /** Cash balance right after this movement (counting every type, not only the filtered ones) */
    balance: number;
    /** Who the money came from / went to: customer, DSR, SR, company, bill title */
    party: string | null;
    /** Order number, when the movement belongs to an order */
    orderNumber: string | null;
    orderId: number | null;
    /** The customer / DSR / SR / company id, for linking to its page */
    entityId: number | null;
    method: string | null;
    note: string | null;
}

export interface CashLedgerDay {
    date: string;
    moneyIn: number;
    moneyOut: number;
    /** Balance at the end of the day */
    balance: number;
}

export interface CashLedgerResponse {
    entries: CashLedgerEntry[];
    summary: {
        startDate: string | null;
        endDate: string | null;
        /** Balance before the first day of the range (0 when there is no start date) */
        openingBalance: number;
        /** Totals for the range and the chosen types */
        totalIn: number;
        totalOut: number;
        /** Balance at the end of the range (all types) */
        closingBalance: number;
        /** Balance today, all time and all types: equals the dashboard's Cash Balance */
        currentBalance: number;
        byType: { type: CashLedgerType; moneyIn: number; moneyOut: number; count: number }[];
    };
    /** End-of-day balance for each day in the range that had a movement, oldest first */
    days: CashLedgerDay[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Every cash movement, signed (+ in, − out). Dates are compared as YYYY-MM-DD text, the same
 * way the dashboard filters them (bills.bill_date is a text column).
 */
const movements = sql`
    SELECT 'opening_cash'::text AS type, ob.id AS source_id, ob.balance_date::text AS date, 0 AS priority,
           CAST(ob.amount AS numeric) AS amount, ob.created_at,
           'Opening cash balance'::text AS party, NULL::text AS order_number, NULL::int AS order_id,
           NULL::int AS entity_id, NULL::text AS method, ob.note
    FROM opening_balances ob
    WHERE ob.type = 'cash'
    UNION ALL
    SELECT 'order_payment', p.id, p.payment_date::text, 1,
           CAST(p.amount AS numeric), p.created_at,
           d.name, o.order_number, p.order_id,
           o.dsr_id, p.payment_method, p.note
    FROM order_payments p
    LEFT JOIN wholesale_orders o ON o.id = p.order_id
    LEFT JOIN dsr d ON d.id = o.dsr_id
    UNION ALL
    SELECT 'due_collection', dc.id, dc.collection_date::text, 1,
           CAST(dc.amount AS numeric), dc.created_at,
           COALESCE(NULLIF(c.shop_name, ''), c.name), o.order_number, dc.order_id,
           dc.customer_id, dc.payment_method, dc.note
    FROM due_collections dc
    LEFT JOIN customer c ON c.id = dc.customer_id
    LEFT JOIN wholesale_orders o ON o.id = dc.order_id
    UNION ALL
    SELECT 'dsr_due_collection', ddc.id, ddc.collection_date::text, 1,
           CAST(ddc.amount AS numeric), ddc.created_at,
           d.name, o.order_number, ddc.order_id,
           ddc.dsr_id, ddc.payment_method, ddc.note
    FROM dsr_due_collections ddc
    LEFT JOIN dsr d ON d.id = ddc.dsr_id
    LEFT JOIN wholesale_orders o ON o.id = ddc.order_id
    UNION ALL
    SELECT 'sr_due_collection', sdc.id, sdc.collection_date::text, 1,
           CAST(sdc.amount AS numeric), sdc.created_at,
           s.name, o.order_number, sdc.order_id,
           sdc.sr_id, sdc.payment_method, sdc.note
    FROM sr_due_collections sdc
    LEFT JOIN sr s ON s.id = sdc.sr_id
    LEFT JOIN wholesale_orders o ON o.id = sdc.order_id
    UNION ALL
    SELECT 'supplier_payment', sp.id, sp.payment_date::text, 1,
           -CAST(sp.amount AS numeric), sp.created_at,
           b.name, NULL, NULL,
           sp.brand_id, sp.payment_method, sp.note
    FROM supplier_payments sp
    LEFT JOIN brand b ON b.id = sp.brand_id
    WHERE sp.from_cash_balance = true
    UNION ALL
    SELECT 'cash_withdrawal', cw.id, cw.withdrawal_date::text, 1,
           -CAST(cw.amount AS numeric), cw.created_at,
           'Cash withdrawal', NULL, NULL,
           NULL, NULL, cw.note
    FROM cash_withdrawals cw
    UNION ALL
    SELECT 'bill', bl.id, bl.bill_date, 1,
           -CAST(bl.amount AS numeric), bl.created_at,
           bl.title, NULL, NULL,
           bl.bill_type_id, bt.name, bl.note
    FROM bills bl
    LEFT JOIN bill_types bt ON bt.id = bl.bill_type_id`;

/** Movements with the running balance: oldest first, opening balance first within its day. */
const ledger = sql`
    SELECT m.*,
           SUM(m.amount) OVER (
               ORDER BY m.date, m.priority, m.created_at, m.type, m.source_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS balance,
           ROW_NUMBER() OVER (ORDER BY m.date, m.priority, m.created_at, m.type, m.source_id) AS seq
    FROM (${movements}) m`;

const round2 = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

type Rows = { rows: unknown[] };

export async function getCashLedger(query: CashLedgerQuery = {}, database = db): Promise<CashLedgerResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(500, Math.max(1, query.limit || 50));
    const order = query.order === "asc" ? sql`ASC` : sql`DESC`;
    const types = (query.types || []).filter((t) => (CASH_LEDGER_TYPES as readonly string[]).includes(t));

    const rangeConditions: SQL[] = [];
    if (query.startDate) rangeConditions.push(sql`l.date >= ${query.startDate}`);
    if (query.endDate) rangeConditions.push(sql`l.date <= ${query.endDate}`);
    const filterConditions = [...rangeConditions];
    if (types.length > 0) {
        filterConditions.push(sql`l.type IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`);
    }
    const where = (conditions: SQL[]) =>
        conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const execute = (query: SQL) => database.execute(query) as unknown as Promise<Rows>;

    const [balancesResult, byTypeResult, countResult, entriesResult, daysResult] = await Promise.all([
        execute(sql`
            SELECT
                COALESCE(SUM(m.amount) FILTER (WHERE ${query.startDate ? sql`m.date < ${query.startDate}` : sql`false`}), 0) AS opening,
                COALESCE(SUM(m.amount) FILTER (WHERE ${query.endDate ? sql`m.date <= ${query.endDate}` : sql`true`}), 0) AS closing,
                COALESCE(SUM(m.amount), 0) AS current
            FROM (${movements}) m`),
        execute(sql`
            SELECT l.type,
                   COALESCE(SUM(l.amount) FILTER (WHERE l.amount > 0), 0) AS money_in,
                   COALESCE(-SUM(l.amount) FILTER (WHERE l.amount < 0), 0) AS money_out,
                   COUNT(*)::int AS count
            FROM (${movements}) l
            ${where(filterConditions)}
            GROUP BY l.type`),
        execute(sql`SELECT COUNT(*)::int AS total FROM (${movements}) l ${where(filterConditions)}`),
        execute(sql`
            SELECT l.type, l.source_id, l.date, l.amount, l.balance, l.party, l.order_number, l.order_id,
                   l.entity_id, l.method, l.note
            FROM (${ledger}) l
            ${where(filterConditions)}
            ORDER BY l.seq ${order}
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
        // End-of-day balance (all types) for each day in the range that had a movement of the chosen types
        execute(sql`
            SELECT l.date,
                   COALESCE(SUM(l.amount) FILTER (WHERE l.amount > 0 ${types.length > 0 ? sql`AND l.type IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})` : sql``}), 0) AS money_in,
                   COALESCE(-SUM(l.amount) FILTER (WHERE l.amount < 0 ${types.length > 0 ? sql`AND l.type IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})` : sql``}), 0) AS money_out,
                   (ARRAY_AGG(l.balance ORDER BY l.seq DESC))[1] AS balance
            FROM (${ledger}) l
            ${where(rangeConditions)}
            GROUP BY l.date
            ORDER BY l.date ASC`),
    ]);

    const balances = balancesResult.rows[0] as { opening: string; closing: string; current: string } | undefined;
    const byType = (byTypeResult.rows as { type: CashLedgerType; money_in: string; money_out: string; count: number }[])
        .map((r) => ({ type: r.type, moneyIn: round2(r.money_in), moneyOut: round2(r.money_out), count: Number(r.count) }))
        .sort((a, b) => CASH_LEDGER_TYPES.indexOf(a.type) - CASH_LEDGER_TYPES.indexOf(b.type));
    const total = Number((countResult.rows[0] as { total: number } | undefined)?.total ?? 0);

    const entries: CashLedgerEntry[] = (entriesResult.rows as Record<string, unknown>[]).map((r) => {
        const amount = round2(r.amount);
        return {
            key: `${r.type}-${r.source_id}`,
            type: r.type as CashLedgerType,
            sourceId: Number(r.source_id),
            date: String(r.date),
            amount,
            moneyIn: amount > 0 ? amount : 0,
            moneyOut: amount < 0 ? -amount : 0,
            balance: round2(r.balance),
            party: r.party == null ? null : String(r.party),
            orderNumber: r.order_number == null ? null : String(r.order_number),
            orderId: r.order_id == null ? null : Number(r.order_id),
            entityId: r.entity_id == null ? null : Number(r.entity_id),
            method: r.method == null ? null : String(r.method),
            note: r.note == null || r.note === "" ? null : String(r.note),
        };
    });

    const days: CashLedgerDay[] = (daysResult.rows as Record<string, unknown>[])
        .map((r) => ({ date: String(r.date), moneyIn: round2(r.money_in), moneyOut: round2(r.money_out), balance: round2(r.balance) }));

    return {
        entries,
        summary: {
            startDate: query.startDate ?? null,
            endDate: query.endDate ?? null,
            openingBalance: round2(balances?.opening),
            totalIn: round2(byType.reduce((s, t) => s + t.moneyIn, 0)),
            totalOut: round2(byType.reduce((s, t) => s + t.moneyOut, 0)),
            closingBalance: round2(balances?.closing),
            currentBalance: round2(balances?.current),
            byType,
        },
        days,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
}
