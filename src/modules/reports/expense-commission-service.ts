import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db/config";
import { dsr, orderExpenses, route, sr, srCommissions, wholesaleOrders } from "../../db/schema";
import type { ExpenseCommissionQuery } from "./validation";
import {
    summarizeExpenseCommissionEntries,
    type ExpenseCommissionEntry,
} from "./expense-commission-model";

export async function getExpenseCommissionReport(query: ExpenseCommissionQuery) {
    const positiveSrIds = query.srIds?.filter((id) => id > 0) ?? [];
    const includesDbPoint = query.srIds?.includes(0) ?? false;

    const expenseConditions = [];
    if (query.startDate) expenseConditions.push(gte(wholesaleOrders.orderDate, query.startDate));
    if (query.endDate) expenseConditions.push(lte(wholesaleOrders.orderDate, query.endDate));
    if (query.dsrIds?.length) expenseConditions.push(inArray(wholesaleOrders.dsrId, query.dsrIds));
    if (query.srIds?.length) {
        if (includesDbPoint && positiveSrIds.length) {
            expenseConditions.push(or(
                isNull(orderExpenses.srId),
                inArray(orderExpenses.srId, positiveSrIds)
            ));
        } else if (includesDbPoint) {
            expenseConditions.push(isNull(orderExpenses.srId));
        } else {
            expenseConditions.push(inArray(orderExpenses.srId, positiveSrIds));
        }
    }

    const expenseRows = await db
        .select({
            id: orderExpenses.id,
            attributionDate: wholesaleOrders.orderDate,
            srId: orderExpenses.srId,
            srName: sr.name,
            dsrId: wholesaleOrders.dsrId,
            dsrName: dsr.name,
            orderId: wholesaleOrders.id,
            orderNumber: wholesaleOrders.orderNumber,
            routeId: wholesaleOrders.routeId,
            routeName: route.name,
            expenseType: orderExpenses.expenseType,
            amount: orderExpenses.amount,
            note: orderExpenses.note,
        })
        .from(orderExpenses)
        .innerJoin(wholesaleOrders, eq(orderExpenses.orderId, wholesaleOrders.id))
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        .innerJoin(route, eq(wholesaleOrders.routeId, route.id))
        .leftJoin(sr, eq(orderExpenses.srId, sr.id))
        .where(expenseConditions.length ? and(...expenseConditions) : undefined)
        .orderBy(desc(wholesaleOrders.orderDate), desc(orderExpenses.id));

    const entries: ExpenseCommissionEntry[] = expenseRows.map((row) => ({
        id: `expense-${row.id}`,
        attributionDate: row.attributionDate,
        source: "order_expense",
        ownerType: row.srId === null ? "db_point" : "sr",
        srId: row.srId,
        srName: row.srName ?? "DB Point",
        dsrId: row.dsrId,
        dsrName: row.dsrName,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        routeId: row.routeId,
        routeName: row.routeName,
        expenseType: row.expenseType,
        amount: row.amount,
        note: row.note,
    }));

    // Manual commissions are not tied to an order or DSR, so a DSR filter excludes them.
    if (!query.dsrIds?.length && (!query.srIds?.length || positiveSrIds.length > 0)) {
        const manualConditions = [eq(srCommissions.sourceType, "manual")];
        if (query.startDate) manualConditions.push(gte(srCommissions.commissionDate, query.startDate));
        if (query.endDate) manualConditions.push(lte(srCommissions.commissionDate, query.endDate));
        if (query.srIds?.length) manualConditions.push(inArray(srCommissions.srId, positiveSrIds));

        const manualRows = await db
            .select({
                id: srCommissions.id,
                attributionDate: srCommissions.commissionDate,
                srId: srCommissions.srId,
                srName: sr.name,
                amount: srCommissions.amount,
                note: srCommissions.note,
            })
            .from(srCommissions)
            .innerJoin(sr, eq(srCommissions.srId, sr.id))
            .where(and(...manualConditions))
            .orderBy(desc(srCommissions.commissionDate), desc(srCommissions.id));

        entries.push(...manualRows.map((row): ExpenseCommissionEntry => ({
            id: `manual-${row.id}`,
            attributionDate: row.attributionDate,
            source: "manual_commission",
            ownerType: "sr",
            srId: row.srId,
            srName: row.srName,
            dsrId: null,
            dsrName: null,
            orderId: null,
            orderNumber: null,
            routeId: null,
            routeName: null,
            expenseType: "manual_commission",
            amount: row.amount,
            note: row.note,
        })));
    }

    entries.sort((a, b) =>
        b.attributionDate.localeCompare(a.attributionDate) || b.id.localeCompare(a.id)
    );

    return {
        entries,
        summary: summarizeExpenseCommissionEntries(entries),
    };
}
