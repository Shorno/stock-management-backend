import { db } from "../../db/config";
import {
    customer,
    route,
    smsLogs,
    smsSettings,
    smsTemplates,
    wholesaleOrders,
    type NewSmsLog,
    type SmsSettings,
} from "../../db/schema";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getCustomerDueSummary } from "../due-collection/service";
import { logError } from "../../lib/error-handler";
import { isSmsConfigured, sendSms } from "./alpha-sms";
import {
    DEFAULT_COLLECTION_TEMPLATE,
    DEFAULT_REMINDER_TEMPLATE,
    DEFAULT_SETTLEMENT_TEMPLATE,
    countSegments,
    daysSince,
    formatMoney,
    formatSmsDate,
    normalizeBdPhone,
    renderTemplate,
    type SmsVariables,
} from "./template";
import type {
    GetRecipientsQuery,
    GetSmsLogsQuery,
    SendSmsInput,
    SmsTemplateInput,
    UpdateSmsSettingsInput,
} from "./validation";

export interface SmsSender {
    id?: string | null;
    name?: string | null;
}

type SmsType = "settlement" | "collection" | "reminder" | "custom" | "test";

/** Recipients above this count are sent in the background. */
const SYNC_SEND_LIMIT = 25;
const SEND_CONCURRENCY = 4;

// ==================== SETTINGS ====================

export async function getSmsSettings(): Promise<SmsSettings> {
    const existing = await db.query.smsSettings.findFirst();
    if (existing) return existing;

    const [created] = await db.insert(smsSettings).values({
        settlementTemplate: DEFAULT_SETTLEMENT_TEMPLATE,
        collectionTemplate: DEFAULT_COLLECTION_TEMPLATE,
        reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
    }).returning();
    if (!created) throw new Error("Failed to create SMS settings");
    return created;
}

export async function updateSmsSettings(input: UpdateSmsSettingsInput): Promise<SmsSettings> {
    const current = await getSmsSettings();
    const [updated] = await db.update(smsSettings).set(input).where(eq(smsSettings.id, current.id)).returning();
    if (!updated) throw new Error("Failed to update SMS settings");
    return updated;
}

/** Empty templates fall back to the defaults so a misconfigured row never sends a blank SMS. */
function templates(settings: SmsSettings) {
    return {
        settlement: settings.settlementTemplate.trim() || DEFAULT_SETTLEMENT_TEMPLATE,
        collection: settings.collectionTemplate.trim() || DEFAULT_COLLECTION_TEMPLATE,
        reminder: settings.reminderTemplate.trim() || DEFAULT_REMINDER_TEMPLATE,
    };
}

// ==================== SAVED TEMPLATES ====================

export const listTemplates = () => db.select().from(smsTemplates).orderBy(desc(smsTemplates.updatedAt));

export async function createTemplate(input: SmsTemplateInput) {
    const [row] = await db.insert(smsTemplates).values(input).returning();
    return row;
}

export async function updateTemplate(id: number, input: SmsTemplateInput) {
    const [row] = await db.update(smsTemplates).set(input).where(eq(smsTemplates.id, id)).returning();
    return row ?? null;
}

export async function deleteTemplate(id: number) {
    const rows = await db.delete(smsTemplates).where(eq(smsTemplates.id, id)).returning({ id: smsTemplates.id });
    return rows.length > 0;
}

// ==================== DUE DATA ====================

export interface CustomerDueSnapshot {
    totalDue: number;
    oldestDueDate: string | null;
}

/**
 * Total outstanding due (direct + SR/DSR-tagged + opening) and the order date of
 * the oldest unpaid due, per customer.
 */
export async function getCustomerDueSnapshots(customerIds?: number[]): Promise<Map<number, CustomerDueSnapshot>> {
    const result = new Map<number, CustomerDueSnapshot>();
    if (customerIds && customerIds.length === 0) return result;

    const totals = await getCustomerDueSummary(customerIds);
    const idFilter = (column: SQL) => customerIds
        ? sql`AND ${column} IN (${sql.join(customerIds.map((id) => sql`${id}`), sql`, `)})`
        : sql``;

    const oldest = await db.execute(sql`
        SELECT customer_id, to_char(MIN(order_date), 'YYYY-MM-DD') AS oldest_due_date FROM (
            SELECT d.customer_id, o.order_date FROM order_customer_dues d
              JOIN wholesale_orders o ON o.id = d.order_id
             WHERE d.customer_id IS NOT NULL AND d.amount - d.collected_amount > 0 ${idFilter(sql`d.customer_id`)}
            UNION ALL
            SELECT s.customer_id, o.order_date FROM order_sr_dues s
              JOIN wholesale_orders o ON o.id = s.order_id
             WHERE s.customer_id IS NOT NULL AND s.amount - s.collected_amount > 0 ${idFilter(sql`s.customer_id`)}
            UNION ALL
            SELECT ds.customer_id, o.order_date FROM order_dsr_dues ds
              JOIN wholesale_orders o ON o.id = ds.order_id
             WHERE ds.customer_id IS NOT NULL AND ds.amount - ds.collected_amount > 0 ${idFilter(sql`ds.customer_id`)}
        ) t GROUP BY customer_id`);

    const oldestMap = new Map<number, string>();
    for (const row of oldest.rows as { customer_id: number; oldest_due_date: string | null }[]) {
        if (row.oldest_due_date) oldestMap.set(Number(row.customer_id), row.oldest_due_date);
    }

    const ids = new Set<number>([...Object.keys(totals).map(Number), ...oldestMap.keys()]);
    for (const id of ids) {
        result.set(id, {
            totalDue: Math.round((totals[id] ?? 0) * 100) / 100,
            oldestDueDate: oldestMap.get(id) ?? null,
        });
    }
    return result;
}

/** Remaining due per customer created by one order (customer, SR- and DSR-tagged dues). */
export async function getOrderCustomerDueAmounts(orderId: number): Promise<Map<number, number>> {
    const rows = await db.execute(sql`
        SELECT customer_id, SUM(remaining)::float8 AS remaining FROM (
            SELECT customer_id, amount - collected_amount AS remaining FROM order_customer_dues
             WHERE order_id = ${orderId} AND customer_id IS NOT NULL
            UNION ALL
            SELECT customer_id, amount - collected_amount FROM order_sr_dues
             WHERE order_id = ${orderId} AND customer_id IS NOT NULL
            UNION ALL
            SELECT customer_id, amount - collected_amount FROM order_dsr_dues
             WHERE order_id = ${orderId} AND customer_id IS NOT NULL
        ) t GROUP BY customer_id`);

    const map = new Map<number, number>();
    for (const row of rows.rows as { customer_id: number; remaining: number }[]) {
        map.set(Number(row.customer_id), Math.round(Number(row.remaining) * 100) / 100);
    }
    return map;
}

export interface SmsRecipient {
    customerId: number;
    name: string;
    shopName: string | null;
    mobile: string | null;
    hasValidMobile: boolean;
    routeId: number | null;
    routeName: string | null;
    totalDue: number;
    oldestDueDate: string | null;
    daysOverdue: number | null;
}

export async function getRecipients(query: GetRecipientsQuery): Promise<SmsRecipient[]> {
    const conditions: SQL[] = [];
    if (query.routeId) conditions.push(eq(customer.routeId, query.routeId));
    if (query.search) {
        const term = `%${query.search}%`;
        conditions.push(or(ilike(customer.name, term), ilike(customer.shopName, term), ilike(customer.mobile, term))!);
    }

    const customers = await db
        .select({
            customerId: customer.id,
            name: customer.name,
            shopName: customer.shopName,
            mobile: customer.mobile,
            routeId: customer.routeId,
            routeName: route.name,
        })
        .from(customer)
        .leftJoin(route, eq(customer.routeId, route.id))
        .where(conditions.length ? and(...conditions) : undefined);

    const snapshots = await getCustomerDueSnapshots();

    return customers
        .map((c) => {
            const snap = snapshots.get(c.customerId);
            return {
                ...c,
                hasValidMobile: normalizeBdPhone(c.mobile) !== null,
                totalDue: snap?.totalDue ?? 0,
                oldestDueDate: snap?.oldestDueDate ?? null,
                daysOverdue: daysSince(snap?.oldestDueDate),
            };
        })
        .filter((r) => !query.dueOnly || r.totalDue > 0)
        .filter((r) => query.minDays === undefined || (r.daysOverdue ?? -1) >= query.minDays)
        .sort((a, b) => b.totalDue - a.totalDue || a.name.localeCompare(b.name));
}

// ==================== DELIVERY ====================

export interface DeliveryAttempt {
    customerId: number | null;
    name: string | null;
    phone: string | null;
    status: "sent" | "failed" | "skipped";
    error?: string;
}

interface DeliverParams {
    customerId: number | null;
    name: string | null;
    phone: string | null | undefined;
    message: string;
    type: SmsType;
    sender: SmsSender;
    orderId?: number;
    dueCollectionId?: number;
}

/** Send one SMS and record the attempt. Customers without a mobile number are skipped silently. */
async function deliver(params: DeliverParams): Promise<DeliveryAttempt> {
    const base = { customerId: params.customerId, name: params.name };
    if (!params.phone?.trim()) return { ...base, phone: null, status: "skipped", error: "No mobile number" };

    const phone = normalizeBdPhone(params.phone);
    const result = phone
        ? await sendSms(phone, params.message)
        : { ok: false, error: `Invalid mobile number: ${params.phone}` };

    const log: NewSmsLog = {
        customerId: params.customerId,
        recipientName: params.name?.slice(0, 150) ?? null,
        phone: (phone ?? params.phone).slice(0, 20),
        message: params.message,
        type: params.type,
        status: result.ok ? "sent" : "failed",
        segments: countSegments(params.message).segments,
        requestId: "requestId" in result ? result.requestId ?? null : null,
        error: result.error ?? null,
        orderId: params.orderId ?? null,
        dueCollectionId: params.dueCollectionId ?? null,
        sentByUserId: params.sender.id ?? null,
        sentByName: params.sender.name?.slice(0, 150) ?? null,
    };
    try {
        await db.insert(smsLogs).values(log);
    } catch (error) {
        logError("Failed to write SMS log:", error);
    }

    return { ...base, phone: phone ?? params.phone, status: result.ok ? "sent" : "failed", error: result.error };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]!);
        }
    });
    await Promise.all(workers);
    return results;
}

function baseVariables(settings: SmsSettings, sender: SmsSender): SmsVariables {
    return { company: settings.companyName, user: sender.name ?? "" };
}

function assertReady(settings: SmsSettings) {
    if (!isSmsConfigured()) throw new SmsNotReadyError("SMS API key is not configured on the server (ALPHA_SMS_API_KEY)");
    if (!settings.enabled) throw new SmsNotReadyError("SMS sending is turned off. Enable it in SMS Settings.");
}

export class SmsNotReadyError extends Error { }

// ==================== AUTOMATIC NOTIFICATIONS ====================

/**
 * After an order settlement is saved: SMS every customer whose due on this order is
 * new or changed. `force` overrides the auto-send setting (the user ticked/unticked
 * the checkbox on the settlement page); the master switch still applies.
 */
export async function notifySettlement(params: {
    orderId: number;
    before: Map<number, number>;
    sender: SmsSender;
    force?: boolean;
}): Promise<DeliveryAttempt[]> {
    const settings = await getSmsSettings();
    const shouldSend = params.force ?? settings.autoSendOnSettlement;
    if (!shouldSend || !settings.enabled || !isSmsConfigured()) return [];

    const after = await getOrderCustomerDueAmounts(params.orderId);
    const changed = [...after.entries()]
        .filter(([id, amount]) => amount > 0 && Math.abs(amount - (params.before.get(id) ?? 0)) >= 0.01)
        .map(([id]) => id);
    if (changed.length === 0) return [];

    const [order] = await db
        .select({ orderNumber: wholesaleOrders.orderNumber, orderDate: wholesaleOrders.orderDate })
        .from(wholesaleOrders)
        .where(eq(wholesaleOrders.id, params.orderId));
    const customers = await db
        .select({ id: customer.id, name: customer.name, shopName: customer.shopName, mobile: customer.mobile })
        .from(customer)
        .where(inArray(customer.id, changed));
    const snapshots = await getCustomerDueSnapshots(changed);
    const template = templates(settings).settlement;

    return mapLimit(customers, SEND_CONCURRENCY, (c) => {
        const currentDue = after.get(c.id) ?? 0;
        const totalDue = snapshots.get(c.id)?.totalDue ?? currentDue;
        const message = renderTemplate(template, {
            ...baseVariables(settings, params.sender),
            customer: c.name,
            shop: c.shopName ?? c.name,
            date: formatSmsDate(order?.orderDate),
            orderNo: order?.orderNumber ?? "",
            currentDue: formatMoney(currentDue),
            previousDue: formatMoney(Math.max(0, totalDue - currentDue)),
            totalDue: formatMoney(totalDue),
            oldestDueDate: formatSmsDate(snapshots.get(c.id)?.oldestDueDate),
        });
        return deliver({
            customerId: c.id, name: c.name, phone: c.mobile, message, type: "settlement",
            sender: params.sender, orderId: params.orderId,
        });
    });
}

/** After a customer due collection is recorded. */
export async function notifyCollection(params: {
    customerId: number;
    amount: number;
    collectionDate: string;
    dueCollectionId?: number;
    sender: SmsSender;
    force?: boolean;
}): Promise<DeliveryAttempt | null> {
    const settings = await getSmsSettings();
    const shouldSend = params.force ?? settings.autoSendOnCollection;
    if (!shouldSend || !settings.enabled || !isSmsConfigured()) return null;

    const [c] = await db
        .select({ id: customer.id, name: customer.name, shopName: customer.shopName, mobile: customer.mobile })
        .from(customer)
        .where(eq(customer.id, params.customerId));
    if (!c) return null;

    const snap = (await getCustomerDueSnapshots([c.id])).get(c.id);
    const remaining = snap?.totalDue ?? 0;
    const message = renderTemplate(templates(settings).collection, {
        ...baseVariables(settings, params.sender),
        customer: c.name,
        shop: c.shopName ?? c.name,
        date: formatSmsDate(params.collectionDate),
        collected: formatMoney(params.amount),
        previousDue: formatMoney(remaining + params.amount),
        remainingDue: formatMoney(remaining),
        totalDue: formatMoney(remaining),
        oldestDueDate: formatSmsDate(snap?.oldestDueDate),
    });
    return deliver({
        customerId: c.id, name: c.name, phone: c.mobile, message, type: "collection",
        sender: params.sender, dueCollectionId: params.dueCollectionId,
    });
}

// ==================== MANUAL SENDING ====================

async function buildCustomerMessages(customerIds: number[], template: string, settings: SmsSettings, sender: SmsSender) {
    const customers = await db
        .select({ id: customer.id, name: customer.name, shopName: customer.shopName, mobile: customer.mobile })
        .from(customer)
        .where(inArray(customer.id, customerIds));
    const snapshots = await getCustomerDueSnapshots(customerIds);
    const today = formatSmsDate(new Date());

    return customers.map((c) => {
        const snap = snapshots.get(c.id);
        const totalDue = snap?.totalDue ?? 0;
        return {
            customer: c,
            message: renderTemplate(template, {
                ...baseVariables(settings, sender),
                customer: c.name,
                shop: c.shopName ?? c.name,
                date: today,
                totalDue: formatMoney(totalDue),
                currentDue: formatMoney(totalDue),
                remainingDue: formatMoney(totalDue),
                oldestDueDate: formatSmsDate(snap?.oldestDueDate),
                days: daysSince(snap?.oldestDueDate) ?? "",
            }),
        };
    });
}

/** Render a message for one customer (or with sample values) without sending it. */
export async function previewMessage(template: string, customerId: number | undefined, sender: SmsSender) {
    const settings = await getSmsSettings();
    let message: string;
    if (customerId) {
        const [built] = await buildCustomerMessages([customerId], template, settings, sender);
        message = built?.message ?? template;
    } else {
        message = renderTemplate(template, {
            ...baseVariables(settings, sender),
            customer: "রহিম উদ্দিন", shop: "রহিম স্টোর", date: formatSmsDate(new Date()), orderNo: "WO-2026-0001",
            currentDue: "1,500", previousDue: "2,000", totalDue: "3,500", collected: "1,000",
            remainingDue: "2,500", oldestDueDate: "01/10/2026", days: 37,
        });
    }
    return { message, ...countSegments(message) };
}

export interface BulkSendResult {
    total: number;
    background: boolean;
    sent: number;
    failed: number;
    skipped: number;
    attempts: DeliveryAttempt[];
}

/**
 * Due reminders and custom notices/offers. Each customer gets their own rendered
 * message. Large batches continue in the background; results land in SMS history.
 */
export async function sendToCustomers(input: SendSmsInput, sender: SmsSender): Promise<BulkSendResult> {
    const settings = await getSmsSettings();
    assertReady(settings);

    const ids = [...new Set(input.customerIds)];
    const built = await buildCustomerMessages(ids, input.message, settings, sender);
    const run = () => mapLimit(built, SEND_CONCURRENCY, ({ customer: c, message }) =>
        deliver({ customerId: c.id, name: c.name, phone: c.mobile, message, type: input.type, sender }));

    const withMobile = built.filter((b) => b.customer.mobile?.trim()).length;
    if (built.length > SYNC_SEND_LIMIT) {
        run().catch((error) => logError("Background SMS batch failed:", error));
        return { total: built.length, background: true, sent: 0, failed: 0, skipped: built.length - withMobile, attempts: [] };
    }

    const attempts = await run();
    return {
        total: built.length,
        background: false,
        sent: attempts.filter((a) => a.status === "sent").length,
        failed: attempts.filter((a) => a.status === "failed").length,
        skipped: attempts.filter((a) => a.status === "skipped").length,
        attempts,
    };
}

export async function sendTestSms(phone: string, message: string | undefined, sender: SmsSender) {
    const settings = await getSmsSettings();
    if (!isSmsConfigured()) throw new SmsNotReadyError("SMS API key is not configured on the server (ALPHA_SMS_API_KEY)");
    const text = message?.trim() || `Test SMS from ${settings.companyName || "Stock Management"}.`;
    return deliver({ customerId: null, name: "Test", phone, message: text, type: "test", sender });
}

// ==================== LOGS ====================

export async function listLogs(query: GetSmsLogsQuery) {
    const conditions: SQL[] = [];
    if (query.type) conditions.push(eq(smsLogs.type, query.type));
    if (query.status) conditions.push(eq(smsLogs.status, query.status));
    if (query.customerId) conditions.push(eq(smsLogs.customerId, query.customerId));
    if (query.search) {
        const term = `%${query.search}%`;
        conditions.push(or(ilike(smsLogs.recipientName, term), ilike(smsLogs.phone, term), ilike(smsLogs.message, term))!);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ total: count() }).from(smsLogs).where(where);
    const items = await db
        .select()
        .from(smsLogs)
        .where(where)
        .orderBy(desc(smsLogs.createdAt), desc(smsLogs.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);

    const total = Number(totalRow?.total ?? 0);
    return { items, total, page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
}
