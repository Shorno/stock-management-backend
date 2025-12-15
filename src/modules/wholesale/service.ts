import { db } from "../../db/config";
import { wholesaleOrders, wholesaleOrderItems } from "../../db/schema";
import { eq, and, or, ilike, count, gte, lte } from "drizzle-orm";
import type { CreateOrderInput, UpdateOrderInput, GetOrdersQuery, OrderItemInput, AddItemInput, UpdateItemInput } from "./validation";
import type { NewWholesaleOrder, NewWholesaleOrderItem, OrderWithItems } from "./types";

// Unit multipliers for calculating total quantity
const UNIT_MULTIPLIERS: Record<string, number> = {
    PCS: 1,
    KG: 1,
    LTR: 1,
    BOX: 12,
    CARTON: 24,
    DOZEN: 12,
};

// Helper function to generate unique order number
const generateOrderNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `WO-${year}-`;

    // Get the latest order number for this year
    const latestOrder = await db.query.wholesaleOrders.findFirst({
        where: (orders, { like }) => like(orders.orderNumber, `${prefix}%`),
        orderBy: (orders, { desc }) => [desc(orders.orderNumber)],
    });

    let nextNumber = 1;
    if (latestOrder && latestOrder.orderNumber) {
        const parts = latestOrder.orderNumber.split("-");
        if (parts.length >= 3 && parts[2]) {
            const lastNumber = parseInt(parts[2]);
            nextNumber = lastNumber + 1;
        }
    }

    return `${prefix}${nextNumber.toString().padStart(4, "0")}`;
};

// Helper function to calculate item totals
const calculateItemTotals = (item: OrderItemInput) => {
    const subtotal = item.quantity * item.salePrice;
    const net = subtotal - item.discount;
    const totalQuantity = item.quantity * (UNIT_MULTIPLIERS[item.unit] || 1);

    return {
        subtotal: subtotal.toFixed(2),
        net: net.toFixed(2),
        totalQuantity,
    };
};

// Helper function to calculate order totals
const calculateOrderTotals = (items: OrderItemInput[]) => {
    let subtotal = 0;
    let discount = 0;

    items.forEach((item) => {
        const itemSubtotal = item.quantity * item.salePrice;
        subtotal += itemSubtotal;
        discount += item.discount;
    });

    const total = subtotal - discount;

    return {
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        total: total.toFixed(2),
    };
};

// Create a new wholesale order
export const createOrder = async (data: CreateOrderInput): Promise<OrderWithItems> => {
    return await db.transaction(async (tx) => {
        // Generate order number
        const orderNumber = await generateOrderNumber();

        // Calculate order totals
        const totals = calculateOrderTotals(data.items);

        // Create order
        const newOrder: NewWholesaleOrder = {
            orderNumber,
            dsrId: data.dsrId,
            routeId: data.routeId,
            orderDate: data.orderDate,
            categoryId: data.categoryId ?? null,
            brandId: data.brandId ?? null,
            invoiceNote: data.invoiceNote,
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
            status: "pending",
        };

        const [createdOrder] = await tx.insert(wholesaleOrders).values(newOrder).returning();
        if (!createdOrder) {
            throw new Error("Failed to create wholesale order");
        }

        // Create order items
        const orderItems: NewWholesaleOrderItem[] = data.items.map((item) => {
            const itemTotals = calculateItemTotals(item);
            return {
                orderId: createdOrder.id,
                productId: item.productId,
                brandId: item.brandId,
                quantity: item.quantity,
                unit: item.unit,
                totalQuantity: itemTotals.totalQuantity,
                availableQuantity: item.availableQuantity,
                freeQuantity: item.freeQuantity,
                salePrice: item.salePrice.toString(),
                subtotal: itemTotals.subtotal,
                discount: item.discount.toString(),
                net: itemTotals.net,
            };
        });

        await tx.insert(wholesaleOrderItems).values(orderItems);

        // Fetch and return the complete order with items
        const completeOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, createdOrder.id),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                    },
                },
                dsr: true,
                route: true,
                category: true,
                brand: true,
            },
        });

        if (!completeOrder) {
            throw new Error("Failed to retrieve created order");
        }

        return completeOrder as OrderWithItems;
    });
};

// Get orders with filters and pagination
export const getOrders = async (
    query: GetOrdersQuery
): Promise<{ orders: any[]; total: number }> => {
    const conditions = [];

    // Search by order number or DSR name
    if (query.search) {
        conditions.push(
            or(
                ilike(wholesaleOrders.orderNumber, `%${query.search}%`)
            )
        );
    }

    // Filter by DSR
    if (query.dsrId) {
        conditions.push(eq(wholesaleOrders.dsrId, query.dsrId));
    }

    // Filter by route
    if (query.routeId) {
        conditions.push(eq(wholesaleOrders.routeId, query.routeId));
    }

    // Filter by category
    if (query.categoryId) {
        conditions.push(eq(wholesaleOrders.categoryId, query.categoryId));
    }

    // Filter by brand
    if (query.brandId) {
        conditions.push(eq(wholesaleOrders.brandId, query.brandId));
    }

    // Filter by status
    if (query.status) {
        conditions.push(eq(wholesaleOrders.status, query.status));
    }

    // Filter by date range
    if (query.startDate) {
        conditions.push(gte(wholesaleOrders.orderDate, query.startDate));
    }
    if (query.endDate) {
        conditions.push(lte(wholesaleOrders.orderDate, query.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch orders with relations
    const [orders, totalResult] = await Promise.all([
        db.query.wholesaleOrders.findMany({
            where: whereClause,
            limit: query.limit,
            offset: query.offset,
            orderBy: (orders, { desc }) => [desc(orders.createdAt)],
            with: {
                dsr: true,
                route: true,
                category: true,
                brand: true,
                items: true,
            },
        }),
        db
            .select({ count: count() })
            .from(wholesaleOrders)
            .where(whereClause),
    ]);

    // Transform orders to include item count and proper naming
    const transformedOrders = orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        dsrId: order.dsrId,
        dsrName: order.dsr?.name,
        routeId: order.routeId,
        routeName: order.route?.name,
        orderDate: order.orderDate,
        categoryId: order.categoryId,
        categoryName: order.category?.name,
        brandId: order.brandId,
        brandName: order.brand?.name,
        invoiceNote: order.invoiceNote,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        status: order.status,
        itemCount: order.items.length,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
    }));

    return {
        orders: transformedOrders,
        total: totalResult[0]?.count || 0,
    };
};

// Get order by ID
export const getOrderById = async (id: number): Promise<OrderWithItems | undefined> => {
    const order = await db.query.wholesaleOrders.findFirst({
        where: (orders, { eq }) => eq(orders.id, id),
        with: {
            items: {
                with: {
                    product: true,
                    brand: true,
                },
            },
            dsr: true,
            route: true,
            category: true,
            brand: true,
        },
    });

    return order as OrderWithItems | undefined;
};

// Update order
export const updateOrder = async (
    id: number,
    data: UpdateOrderInput
): Promise<OrderWithItems | undefined> => {
    return await db.transaction(async (tx) => {
        // Check if order exists
        const existingOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
        });

        if (!existingOrder) {
            return undefined;
        }

        // Calculate new totals
        const totals = calculateOrderTotals(data.items);

        // Update order
        const updateData: Partial<NewWholesaleOrder> = {
            dsrId: data.dsrId,
            routeId: data.routeId,
            orderDate: data.orderDate,
            categoryId: data.categoryId ?? null,
            brandId: data.brandId ?? null,
            invoiceNote: data.invoiceNote,
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
        };

        await tx
            .update(wholesaleOrders)
            .set(updateData)
            .where(eq(wholesaleOrders.id, id))
            .returning();

        // Delete existing items
        await tx.delete(wholesaleOrderItems).where(eq(wholesaleOrderItems.orderId, id));

        // Create new items
        const orderItems: NewWholesaleOrderItem[] = data.items.map((item) => {
            const itemTotals = calculateItemTotals(item);
            return {
                orderId: id,
                productId: item.productId,
                brandId: item.brandId,
                quantity: item.quantity,
                unit: item.unit,
                totalQuantity: itemTotals.totalQuantity,
                availableQuantity: item.availableQuantity,
                freeQuantity: item.freeQuantity,
                salePrice: item.salePrice.toString(),
                subtotal: itemTotals.subtotal,
                discount: item.discount.toString(),
                net: itemTotals.net,
            };
        });

        await tx.insert(wholesaleOrderItems).values(orderItems);

        // Fetch and return the complete updated order
        const completeOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                    },
                },
                dsr: true,
                route: true,
                category: true,
                brand: true,
            },
        });

        return completeOrder as OrderWithItems | undefined;
    });
};


// Delete order
export const deleteOrder = async (id: number): Promise<boolean> => {
    const result = await db
        .delete(wholesaleOrders)
        .where(eq(wholesaleOrders.id, id))
        .returning();
    return result.length > 0;
};

// Helper function to recalculate order totals from items
const recalculateOrderTotals = async (orderId: number, tx: any) => {
    // Fetch all items for the order
    const items = await tx.query.wholesaleOrderItems.findMany({
        where: (items: any, { eq }: any) => eq(items.orderId, orderId),
    });

    let subtotal = 0;
    let discount = 0;

    items.forEach((item: any) => {
        subtotal += parseFloat(item.subtotal);
        discount += parseFloat(item.discount);
    });

    const total = subtotal - discount;

    // Update order totals
    await tx
        .update(wholesaleOrders)
        .set({
            subtotal: subtotal.toFixed(2),
            discount: discount.toFixed(2),
            total: total.toFixed(2),
        })
        .where(eq(wholesaleOrders.id, orderId));
};

// Add a single item to an order
export const addOrderItem = async (
    orderId: number,
    data: AddItemInput
): Promise<OrderWithItems | undefined> => {
    return await db.transaction(async (tx) => {
        // Check if order exists
        const existingOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders: any, { eq }: any) => eq(orders.id, orderId),
        });

        if (!existingOrder) {
            return undefined;
        }

        // Calculate item totals
        const itemTotals = calculateItemTotals(data);

        // Create new item
        const newItem: NewWholesaleOrderItem = {
            orderId,
            productId: data.productId,
            brandId: data.brandId,
            quantity: data.quantity,
            unit: data.unit,
            totalQuantity: itemTotals.totalQuantity,
            availableQuantity: data.availableQuantity,
            freeQuantity: data.freeQuantity,
            salePrice: data.salePrice.toString(),
            subtotal: itemTotals.subtotal,
            discount: data.discount.toString(),
            net: itemTotals.net,
        };

        await tx.insert(wholesaleOrderItems).values(newItem);

        // Recalculate order totals
        await recalculateOrderTotals(orderId, tx);

        // Fetch and return the complete updated order
        const completeOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders: any, { eq }: any) => eq(orders.id, orderId),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                    },
                },
                dsr: true,
                route: true,
                category: true,
                brand: true,
            },
        });

        return completeOrder as OrderWithItems | undefined;
    });
};

// Update a single item in an order
export const updateOrderItem = async (
    orderId: number,
    itemId: number,
    data: UpdateItemInput
): Promise<OrderWithItems | undefined> => {
    return await db.transaction(async (tx) => {
        // Check if order exists
        const existingOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders: any, { eq }: any) => eq(orders.id, orderId),
        });

        if (!existingOrder) {
            return undefined;
        }

        // Check if item exists and belongs to the order
        const existingItem = await tx.query.wholesaleOrderItems.findFirst({
            where: (items: any, { eq, and }: any) =>
                and(eq(items.id, itemId), eq(items.orderId, orderId)),
        });

        if (!existingItem) {
            return undefined;
        }

        // Merge existing item data with updates
        const updatedItemData = {
            productId: data.productId ?? existingItem.productId,
            brandId: data.brandId ?? existingItem.brandId,
            quantity: data.quantity ?? existingItem.quantity,
            unit: (data.unit ?? existingItem.unit) as "PCS" | "KG" | "LTR" | "BOX" | "CARTON" | "DOZEN",
            totalQuantity: data.totalQuantity ?? existingItem.totalQuantity,
            availableQuantity: data.availableQuantity ?? existingItem.availableQuantity,
            freeQuantity: data.freeQuantity ?? existingItem.freeQuantity,
            salePrice: data.salePrice ?? parseFloat(existingItem.salePrice),
            discount: data.discount ?? parseFloat(existingItem.discount),
        };

        // Calculate new item totals
        const itemTotals = calculateItemTotals(updatedItemData);

        // Update item
        await tx
            .update(wholesaleOrderItems)
            .set({
                productId: updatedItemData.productId,
                brandId: updatedItemData.brandId,
                quantity: updatedItemData.quantity,
                unit: updatedItemData.unit,
                totalQuantity: itemTotals.totalQuantity,
                availableQuantity: updatedItemData.availableQuantity,
                freeQuantity: updatedItemData.freeQuantity,
                salePrice: updatedItemData.salePrice.toString(),
                subtotal: itemTotals.subtotal,
                discount: updatedItemData.discount.toString(),
                net: itemTotals.net,
            })
            .where(eq(wholesaleOrderItems.id, itemId));

        // Recalculate order totals
        await recalculateOrderTotals(orderId, tx);

        // Fetch and return the complete updated order
        const completeOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders: any, { eq }: any) => eq(orders.id, orderId),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                    },
                },
                dsr: true,
                route: true,
                category: true,
                brand: true,
            },
        });

        return completeOrder as OrderWithItems | undefined;
    });
};

// Delete a single item from an order
export const deleteOrderItem = async (
    orderId: number,
    itemId: number
): Promise<OrderWithItems | undefined> => {
    return await db.transaction(async (tx) => {
        // Check if order exists
        const existingOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders: any, { eq }: any) => eq(orders.id, orderId),
        });

        if (!existingOrder) {
            return undefined;
        }

        // Check if item exists and belongs to the order
        const existingItem = await tx.query.wholesaleOrderItems.findFirst({
            where: (items: any, { eq, and }: any) =>
                and(eq(items.id, itemId), eq(items.orderId, orderId)),
        });

        if (!existingItem) {
            return undefined;
        }

        // Check if this is the last item in the order
        const itemCount = await tx.query.wholesaleOrderItems.findMany({
            where: (items: any, { eq }: any) => eq(items.orderId, orderId),
        });

        if (itemCount.length <= 1) {
            throw new Error("Cannot delete the last item in an order. Delete the order instead.");
        }

        // Delete the item
        await tx.delete(wholesaleOrderItems).where(eq(wholesaleOrderItems.id, itemId));

        // Recalculate order totals
        await recalculateOrderTotals(orderId, tx);

        // Fetch and return the complete updated order
        const completeOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders: any, { eq }: any) => eq(orders.id, orderId),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                    },
                },
                dsr: true,
                route: true,
                category: true,
                brand: true,
            },
        });

        return completeOrder as OrderWithItems | undefined;
    });
};

