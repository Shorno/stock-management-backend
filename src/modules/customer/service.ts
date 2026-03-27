import { db } from "../../db/config";
import { customer, route, orderCustomerDues } from "../../db/schema";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import type { CreateCustomerInput, UpdateCustomerInput, GetCustomersQuery } from "./validation";
import type { Customer, NewCustomer } from "./types";

export const createCustomer = async (data: CreateCustomerInput): Promise<Customer> => {
    const newCustomer: NewCustomer = {
        name: data.name,
        shopName: data.shopName || null,
        mobile: data.mobile || null,
        address: data.address || null,
        routeId: data.routeId || null,
        profileImageUrl: data.profileImageUrl || null,
        locationUrl: data.locationUrl || null,
    };

    const [created] = await db.insert(customer).values(newCustomer).returning();
    if (!created) {
        throw new Error("Failed to create customer");
    }
    return created;
};

export interface CustomerWithRoute extends Customer {
    route?: { id: number; name: string } | null;
    totalDue?: string;
}

export const getCustomers = async (
    query: GetCustomersQuery
): Promise<{ customers: CustomerWithRoute[]; total: number }> => {
    const conditions = [];

    if (query.search) {
        conditions.push(
            or(
                ilike(customer.name, `%${query.search}%`),
                ilike(customer.shopName, `%${query.search}%`),
                ilike(customer.mobile, `%${query.search}%`)
            )
        );
    }

    if (query.routeId) {
        conditions.push(eq(customer.routeId, query.routeId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const customersResult = await db
        .select({
            id: customer.id,
            name: customer.name,
            shopName: customer.shopName,
            mobile: customer.mobile,
            address: customer.address,
            profileImageUrl: customer.profileImageUrl,
            locationUrl: customer.locationUrl,
            routeId: customer.routeId,
            createdAt: customer.createdAt,
            updatedAt: customer.updatedAt,
            route: {
                id: route.id,
                name: route.name,
            },
        })
        .from(customer)
        .leftJoin(route, eq(customer.routeId, route.id))
        .where(whereClause)
        .orderBy(customer.name);

    // Get customer IDs to fetch dues
    const customerIds = customersResult.map(c => c.id);

    // Fetch total dues for these customers using inArray
    const duesResult = customerIds.length > 0 ? await db
        .select({
            customerId: orderCustomerDues.customerId,
            totalDue: sql<string>`SUM(CAST(${orderCustomerDues.amount} AS DECIMAL) - CAST(${orderCustomerDues.collectedAmount} AS DECIMAL))`,
        })
        .from(orderCustomerDues)
        .where(sql`${orderCustomerDues.customerId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(orderCustomerDues.customerId) : [];

    // Also fetch opening balances for customer_due type
    const { openingBalances } = await import("../../db/schema");
    const openingDuesResult = customerIds.length > 0 ? await db
        .select({
            entityId: openingBalances.entityId,
            amount: openingBalances.amount,
        })
        .from(openingBalances)
        .where(and(
            eq(openingBalances.type, 'customer_due'),
            sql`${openingBalances.entityId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`
        )) : [];

    // Create a map of customer dues (order-based + opening)
    const duesMap = new Map(duesResult.map(d => [d.customerId, Number(d.totalDue || 0)]));
    for (const ob of openingDuesResult) {
        if (ob.entityId) {
            const existing = duesMap.get(ob.entityId) || 0;
            duesMap.set(ob.entityId, existing + Number(ob.amount || 0));
        }
    }

    // Merge dues with customers
    const customers = customersResult.map(c => ({
        ...c,
        totalDue: (duesMap.get(c.id) || 0).toFixed(2),
    }));

    return {
        customers,
        total: customers.length,
    };
};

export const getCustomerById = async (id: number): Promise<CustomerWithRoute | undefined> => {
    const [result] = await db
        .select({
            id: customer.id,
            name: customer.name,
            shopName: customer.shopName,
            mobile: customer.mobile,
            address: customer.address,
            profileImageUrl: customer.profileImageUrl,
            locationUrl: customer.locationUrl,
            routeId: customer.routeId,
            createdAt: customer.createdAt,
            updatedAt: customer.updatedAt,
            route: {
                id: route.id,
                name: route.name,
            },
        })
        .from(customer)
        .leftJoin(route, eq(customer.routeId, route.id))
        .where(eq(customer.id, id));

    return result;
};

export const updateCustomer = async (
    id: number,
    data: UpdateCustomerInput
): Promise<Customer | undefined> => {
    const updateData: Partial<NewCustomer> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.shopName !== undefined) updateData.shopName = data.shopName;
    if (data.mobile !== undefined) updateData.mobile = data.mobile;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.routeId !== undefined) updateData.routeId = data.routeId;
    if (data.profileImageUrl !== undefined) updateData.profileImageUrl = data.profileImageUrl;
    if (data.locationUrl !== undefined) updateData.locationUrl = data.locationUrl;

    const [updated] = await db
        .update(customer)
        .set(updateData)
        .where(eq(customer.id, id))
        .returning();

    return updated;
};

export const deleteCustomer = async (id: number): Promise<boolean> => {
    const result = await db.delete(customer).where(eq(customer.id, id)).returning();
    return result.length > 0;
};
