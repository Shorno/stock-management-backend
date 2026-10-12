import { eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";
import { orderCustomerDues, orderDsrDues, orderSrDues, customer, dsr, sr } from "../../db/schema";
import type { SaveAdjustmentInput } from "./validation";
import { planDueReconciliation } from "./due-reconcile";

// Works with the app database, a transaction, or a test database
type DueDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const customerDueKey = (customerId: number | null | undefined, customerName: string) =>
    customerId ? `customer:${customerId}` : `name:${customerName.trim().toLowerCase()}`;

// Updates, inserts, and deletes the order's customer/DSR/SR due rows to match the
// submitted adjustment without discarding amounts already collected against them.
export const reconcileOrderDues = async (
    tx: DueDb,
    order: { id: number; dsrId: number },
    data: SaveAdjustmentInput
) => {
    const orderId = order.id;

    // Lock the order's due rows so a concurrent collection can't slip in mid-edit
    const existingCustomerDues = await tx.select().from(orderCustomerDues).where(eq(orderCustomerDues.orderId, orderId)).for("update");
    const existingDsrDues = await tx.select().from(orderDsrDues).where(eq(orderDsrDues.orderId, orderId)).for("update");
    const existingSrDues = await tx.select().from(orderSrDues).where(eq(orderSrDues.orderId, orderId)).for("update");

    // ---- Customer dues (direct entries + DSR dues that name a customer) ----
    const dsrDuesWithCustomer = (data.dsrDues || []).filter((d) => d.amount > 0 && d.customerId);
    const dsrDueCustomerIds = [...new Set(dsrDuesWithCustomer.map((d) => d.customerId!))];
    const dsrDueCustomers = dsrDueCustomerIds.length
        ? await tx.select({ id: customer.id, name: customer.name }).from(customer).where(inArray(customer.id, dsrDueCustomerIds))
        : [];
    const dsrDueCustomerNames = new Map(dsrDueCustomers.map((c) => [c.id, c.name]));

    const incomingCustomerDues = [
        ...data.customerDues
            .filter((d) => d.amount > 0)
            .map((d) => ({
                dueId: d.dueId,
                amount: d.amount,
                key: customerDueKey(d.customerId, d.customerName),
                label: d.customerName,
                customerId: d.customerId || null,
                customerName: d.customerName,
                entrySource: "customer_due" as const,
                note: null as string | null,
            })),
        ...dsrDuesWithCustomer.map((d) => {
            const customerName = dsrDueCustomerNames.get(d.customerId!);
            if (!customerName) {
                throw new Error(`Customer #${d.customerId} not found for DSR due conversion`);
            }
            return {
                // Only trust the id when it points at a customer due row
                dueId: d.dueSource === "customer_due" ? d.dueId : undefined,
                amount: d.amount,
                key: customerDueKey(d.customerId, customerName),
                label: customerName,
                customerId: d.customerId!,
                customerName,
                entrySource: "dsr_due" as const,
                note: d.note || null,
            };
        }),
    ];

    const customerPlan = planDueReconciliation(
        existingCustomerDues.map((row) => ({
            id: row.id,
            amount: parseFloat(row.amount),
            collectedAmount: parseFloat(row.collectedAmount),
            key: customerDueKey(row.customerId, row.customerName),
            label: row.customerName,
        })),
        incomingCustomerDues,
        "Customer due"
    );

    for (const row of customerPlan.deletes) {
        await tx.delete(orderCustomerDues).where(eq(orderCustomerDues.id, row.id));
    }
    for (const { row, entry } of customerPlan.updates) {
        await tx
            .update(orderCustomerDues)
            .set({
                customerId: entry.customerId,
                customerName: entry.customerName,
                amount: entry.amount.toFixed(2),
                entrySource: entry.entrySource,
                note: entry.note,
            })
            .where(eq(orderCustomerDues.id, row.id));
    }
    for (const entry of customerPlan.inserts) {
        await tx.insert(orderCustomerDues).values({
            orderId,
            customerId: entry.customerId,
            customerName: entry.customerName,
            amount: entry.amount.toFixed(2),
            entrySource: entry.entrySource,
            note: entry.note,
        });
    }

    // ---- DSR's own dues (no customer selected) ----
    const [orderDsr] = await tx.select({ name: dsr.name }).from(dsr).where(eq(dsr.id, order.dsrId));
    const dsrLabel = orderDsr?.name || "the DSR";
    const incomingDsrDues = (data.dsrDues || [])
        .filter((d) => d.amount > 0 && !d.customerId)
        .map((d) => ({
            dueId: d.dueSource === "customer_due" ? undefined : d.dueId,
            amount: d.amount,
            key: "dsr",
            label: dsrLabel,
            note: d.note || null,
        }));

    const dsrPlan = planDueReconciliation(
        existingDsrDues.map((row) => ({
            id: row.id,
            amount: parseFloat(row.amount),
            collectedAmount: parseFloat(row.collectedAmount || "0"),
            key: "dsr",
            label: dsrLabel,
        })),
        incomingDsrDues,
        "DSR due"
    );

    for (const row of dsrPlan.deletes) {
        await tx.delete(orderDsrDues).where(eq(orderDsrDues.id, row.id));
    }
    for (const { row, entry } of dsrPlan.updates) {
        await tx
            .update(orderDsrDues)
            .set({
                // Collections are tied to the DSR that owed them; only re-point uncollected dues
                ...(row.collectedAmount > 0 ? {} : { dsrId: order.dsrId }),
                amount: entry.amount.toFixed(2),
                note: entry.note,
            })
            .where(eq(orderDsrDues.id, row.id));
    }
    for (const entry of dsrPlan.inserts) {
        await tx.insert(orderDsrDues).values({
            orderId,
            dsrId: order.dsrId,
            amount: entry.amount.toFixed(2),
            note: entry.note,
        });
    }

    // ---- SR dues ----
    const incomingSrDueRows = (data.srDues || []).filter((d) => d.amount > 0);
    const srIds = [...new Set([...incomingSrDueRows.map((d) => d.srId), ...existingSrDues.map((d) => d.srId)])];
    const srRows = srIds.length
        ? await tx.select({ id: sr.id, name: sr.name }).from(sr).where(inArray(sr.id, srIds))
        : [];
    const srNames = new Map(srRows.map((s) => [s.id, s.name]));
    const srLabel = (srId: number) => srNames.get(srId) || `SR #${srId}`;

    const srPlan = planDueReconciliation(
        existingSrDues.map((row) => ({
            id: row.id,
            amount: parseFloat(row.amount),
            collectedAmount: parseFloat(row.collectedAmount || "0"),
            key: `sr:${row.srId}`,
            label: srLabel(row.srId),
        })),
        incomingSrDueRows.map((d) => ({
            dueId: d.dueId,
            amount: d.amount,
            key: `sr:${d.srId}`,
            label: srLabel(d.srId),
            srId: d.srId,
            customerId: d.customerId || null,
            note: d.note || null,
        })),
        "SR due"
    );

    for (const row of srPlan.deletes) {
        await tx.delete(orderSrDues).where(eq(orderSrDues.id, row.id));
    }
    for (const { row, entry } of srPlan.updates) {
        await tx
            .update(orderSrDues)
            .set({
                srId: entry.srId,
                amount: entry.amount.toFixed(2),
                customerId: entry.customerId,
                note: entry.note,
            })
            .where(eq(orderSrDues.id, row.id));
    }
    for (const entry of srPlan.inserts) {
        await tx.insert(orderSrDues).values({
            orderId,
            srId: entry.srId,
            amount: entry.amount.toFixed(2),
            customerId: entry.customerId,
            note: entry.note,
        });
    }

    return {
        customerDues: incomingCustomerDues.reduce((sum, d) => sum + d.amount, 0),
        dsrDues: incomingDsrDues.reduce((sum, d) => sum + d.amount, 0),
        srDues: incomingSrDueRows.reduce((sum, d) => sum + d.amount, 0),
    };
};
