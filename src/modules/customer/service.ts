import { db } from "../../db/config";
import { customer, route, orderCustomerDues } from "../../db/schema";
import { eq, ilike, count, and, or, sql } from "drizzle-orm";
import type { CreateCustomerInput, UpdateCustomerInput, GetCustomersQuery } from "./validation";
import type { Customer, NewCustomer } from "./types";

export const createCustomer = async (data: CreateCustomerInput): Promise<Customer> => {
    const newCustomer: NewCustomer = {
        name: data.name,
        shopName: data.shopName || null,
        mobile: data.mobile || null,
        address: data.address || null,
        routeId: data.routeId || null,
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

    const [customersResult, totalResult] = await Promise.all([
        db
            .select({
                id: customer.id,
                name: customer.name,
                shopName: customer.shopName,
                mobile: customer.mobile,
                address: customer.address,
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
            .limit(query.limit)
            .offset(query.offset)
            .orderBy(customer.name),
        db
            .select({ count: count() })
            .from(customer)
            .where(whereClause),
    ]);

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

    // Create a map of customer dues
    const duesMap = new Map(duesResult.map(d => [d.customerId, d.totalDue]));

    // Merge dues with customers
    const customers = customersResult.map(c => ({
        ...c,
        totalDue: duesMap.get(c.id) || "0",
    }));

    return {
        customers,
        total: totalResult[0]?.count || 0,
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
