import { db } from "../../db/config";
import { wholesaleOrders, wholesaleOrderItems, stockBatch, orderPayments, orderExpenses, orderItemReturns, orderCustomerDues, orderDamageItems } from "../../db/schema";
import { eq, and, or, ilike, count, gte, lte, sql, ne } from "drizzle-orm";
import type { CreateOrderInput, UpdateOrderInput, GetOrdersQuery, OrderItemInput, SaveAdjustmentInput } from "./validation";
import type { NewWholesaleOrder, NewWholesaleOrderItem, OrderWithItems } from "./types";

// Fallback unit multipliers (used if unit not found in database)
const FALLBACK_UNIT_MULTIPLIERS: Record<string, number> = {
    PCS: 1,
    KG: 1,
    LTR: 1,
    BOX: 12,
    CARTON: 24,
    DOZEN: 12,
};

// Helper function to get unit multiplier from database (with fallback)
const getUnitMultiplier = async (abbreviation: string): Promise<number> => {
    const foundUnit = await db.query.unit.findFirst({
        where: (units, { eq }) => eq(units.abbreviation, abbreviation.toUpperCase()),
    });
    if (foundUnit) {
        return foundUnit.multiplier;
    }
    // Fallback to hardcoded multipliers if unit not found
    return FALLBACK_UNIT_MULTIPLIERS[abbreviation.toUpperCase()] || 1;
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

// Helper function to validate batch and get batch data
const validateAndGetBatch = async (
    batchId: number,
    productId: number,
    requestedQty: number,
    requestedFreeQty: number,
    tx: any
) => {
    // Fetch batch with its variant to check product ownership
    const batch = await tx.query.stockBatch.findFirst({
        where: (batches: any, { eq }: any) => eq(batches.id, batchId),
        with: {
            variant: true,
        },
    });

    if (!batch) {
        throw new Error(`Batch with ID ${batchId} not found`);
    }

    // Check if batch's variant belongs to the product
    if (!batch.variant || batch.variant.productId !== productId) {
        throw new Error(`Batch ${batchId} does not belong to product ${productId}`);
    }

    if (batch.remainingQuantity < requestedQty) {
        throw new Error(
            `Insufficient quantity in batch ${batchId}. Available: ${batch.remainingQuantity}, Requested: ${requestedQty}`
        );
    }

    if (batch.remainingFreeQty < requestedFreeQty) {
        throw new Error(
            `Insufficient free quantity in batch ${batchId}. Available: ${batch.remainingFreeQty}, Requested: ${requestedFreeQty}`
        );
    }

    return batch;
};

// Helper function to calculate item totals (async to fetch unit multiplier)
const calculateItemTotals = async (item: OrderItemInput, salePrice: number) => {
    const multiplier = await getUnitMultiplier(item.unit);
    const extraPieces = item.extraPieces || 0;
    // Total quantity includes: (qty × unit multiplier) + extraPieces + freeQuantity
    const totalQuantity = (item.quantity * multiplier) + extraPieces + item.freeQuantity;
    // Paid quantity excludes freeQuantity (charged items only)
    const paidQuantity = (item.quantity * multiplier) + extraPieces;
    // Calculate subtotal using paid quantity (not total quantity)
    const subtotal = paidQuantity * salePrice;
    const net = subtotal - item.discount;

    return {
        subtotal: subtotal.toFixed(2),
        net: net.toFixed(2),
        totalQuantity,
        salePrice,
    };
};

// Helper function to calculate order totals (async to fetch unit multipliers)
const calculateOrderTotals = async (items: Array<{ quantity: number; unit: string; extraPieces?: number; freeQuantity?: number; salePrice: number; discount: number }>) => {
    let subtotal = 0;
    let discount = 0;

    for (const item of items) {
        // Get unit multiplier and calculate paid quantity (excludes free items)
        const multiplier = await getUnitMultiplier(item.unit);
        const extraPieces = item.extraPieces || 0;
        const paidQuantity = (item.quantity * multiplier) + extraPieces;
        const itemSubtotal = paidQuantity * item.salePrice;
        subtotal += itemSubtotal;
        discount += item.discount;
    }

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

        // Validate batches and get batch data
        const itemsWithBatchData = await Promise.all(
            data.items.map(async (item) => {
                // Validate batch exists and has sufficient quantity
                await validateAndGetBatch(
                    item.batchId,
                    item.productId,
                    item.quantity,
                    item.freeQuantity,
                    tx
                );
                // Use the salePrice provided from frontend (which defaults to batch sellPrice but can be edited)
                return item;
            })
        );

        // Calculate order totals
        const totals = await calculateOrderTotals(itemsWithBatchData);

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

        // Create order items and update batch quantities
        const orderItems: NewWholesaleOrderItem[] = [];

        for (const item of itemsWithBatchData) {
            const itemTotals = await calculateItemTotals(item, item.salePrice);

            orderItems.push({
                orderId: createdOrder.id,
                productId: item.productId,
                batchId: item.batchId,
                brandId: item.brandId,
                quantity: item.quantity,
                unit: item.unit,
                totalQuantity: itemTotals.totalQuantity,
                availableQuantity: item.availableQuantity,
                freeQuantity: item.freeQuantity,
                extraPieces: item.extraPieces || 0,
                salePrice: item.salePrice.toString(),
                subtotal: itemTotals.subtotal,
                discount: item.discount.toString(),
                net: itemTotals.net,
            });

            // Update batch quantities
            await tx
                .update(stockBatch)
                .set({
                    remainingQuantity: sql`${stockBatch.remainingQuantity} - ${item.quantity}`,
                    remainingFreeQty: sql`${stockBatch.remainingFreeQty} - ${item.freeQuantity}`,
                })
                .where(eq(stockBatch.id, item.batchId));
        }

        await tx.insert(wholesaleOrderItems).values(orderItems);

        // Fetch and return the complete order with items
        const completeOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, createdOrder.id),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                        batch: true,
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
                itemReturns: true,  // Include item returns for calculating net sale
            },
        }),
        db
            .select({ count: count() })
            .from(wholesaleOrders)
            .where(whereClause),
    ]);

    // Transform orders to include item count, totalReturns, and netTotal
    // Type assertion needed because Drizzle's query type inference doesn't include relations properly
    const transformedOrders = orders.map((order: any) => {
        // Calculate total returns and adjustment discounts from item returns
        let totalReturns = 0;
        let totalAdjustmentDiscount = 0;

        if (order.itemReturns && order.itemReturns.length > 0) {
            for (const returnItem of order.itemReturns) {
                totalReturns += parseFloat(returnItem.returnAmount || "0");
                totalAdjustmentDiscount += parseFloat(returnItem.adjustmentDiscount || "0");
            }
        }

        const orderTotal = parseFloat(order.total || "0");
        const netTotal = orderTotal - totalReturns - totalAdjustmentDiscount;

        return {
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
            totalReturns: totalReturns.toFixed(2),
            totalAdjustmentDiscount: totalAdjustmentDiscount.toFixed(2),
            netTotal: netTotal.toFixed(2),
            paidAmount: order.paidAmount,
            paymentStatus: order.paymentStatus,
            status: order.status,
            itemCount: order.items?.length || 0,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
        };
    });

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
                    batch: {
                        with: {
                            variant: true,
                        },
                    },
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

        // Validate batches and get batch data
        const itemsWithBatchData = await Promise.all(
            data.items.map(async (item) => {
                // Validate batch exists and has sufficient quantity
                await validateAndGetBatch(
                    item.batchId,
                    item.productId,
                    item.quantity,
                    item.freeQuantity,
                    tx
                );
                // Use the salePrice provided from frontend (which defaults to batch sellPrice but can be edited)
                return item;
            })
        );

        // Calculate new totals
        const totals = await calculateOrderTotals(itemsWithBatchData);

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
        const orderItems: NewWholesaleOrderItem[] = [];
        for (const item of itemsWithBatchData) {
            const itemTotals = await calculateItemTotals(item, item.salePrice);
            orderItems.push({
                orderId: id,
                productId: item.productId,
                batchId: item.batchId,
                brandId: item.brandId,
                quantity: item.quantity,
                unit: item.unit,
                totalQuantity: itemTotals.totalQuantity,
                availableQuantity: item.availableQuantity,
                freeQuantity: item.freeQuantity,
                extraPieces: item.extraPieces || 0,
                salePrice: item.salePrice.toString(),
                subtotal: itemTotals.subtotal,
                discount: item.discount.toString(),
                net: itemTotals.net,
            });
        }

        await tx.insert(wholesaleOrderItems).values(orderItems);

        // Fetch and return the complete updated order
        const completeOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                        batch: true,
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

// Update order status - simplified to only pending/adjusted
export const updateOrderStatus = async (
    id: number,
    status: string
): Promise<OrderWithItems | undefined> => {
    return await db.transaction(async (tx) => {
        // Check if order exists
        const existingOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
        });

        if (!existingOrder) {
            return undefined;
        }

        // Update the status
        await tx
            .update(wholesaleOrders)
            .set({ status })
            .where(eq(wholesaleOrders.id, id));

        // Fetch and return the updated order
        const updatedOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
            with: {
                items: {
                    with: {
                        product: true,
                        brand: true,
                        batch: true,
                    },
                },
                dsr: true,
                route: true,
                category: true,
                brand: true,
            },
        });

        return updatedOrder as OrderWithItems | undefined;
    });
};



// Get payment history for an order
export const getPaymentHistory = async (orderId: number) => {
    return await db.query.orderPayments.findMany({
        where: (payments, { eq }) => eq(payments.orderId, orderId),
        orderBy: (payments, { desc }) => [desc(payments.paymentDate), desc(payments.createdAt)],
    });
};

// Get orders with outstanding dues - computed based on adjustment data
export const getDueOrders = async (params: {
    dsrId?: number;
    routeId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}) => {
    const conditions: any[] = [];

    // Get orders where total > paidAmount (computed due)
    conditions.push(
        sql`CAST(${wholesaleOrders.total} AS DECIMAL) > CAST(${wholesaleOrders.paidAmount} AS DECIMAL)`
    );

    if (params.dsrId) {
        conditions.push(eq(wholesaleOrders.dsrId, params.dsrId));
    }
    if (params.routeId) {
        conditions.push(eq(wholesaleOrders.routeId, params.routeId));
    }
    if (params.startDate) {
        conditions.push(gte(wholesaleOrders.orderDate, params.startDate));
    }
    if (params.endDate) {
        conditions.push(lte(wholesaleOrders.orderDate, params.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orders = await db.query.wholesaleOrders.findMany({
        where: whereClause,
        with: {
            dsr: true,
            route: true,
        },
        orderBy: (orders, { desc }) => [desc(orders.orderDate)],
        limit: params.limit || 50,
        offset: params.offset || 0,
    });

    // Get total count
    const countResult = await db
        .select({ value: count() })
        .from(wholesaleOrders)
        .where(whereClause);
    const total = countResult[0]?.value ?? 0;

    // Calculate total due amount
    const dueResult = await db
        .select({
            totalDue: sql<string>`SUM(CAST(${wholesaleOrders.total} AS DECIMAL) - CAST(${wholesaleOrders.paidAmount} AS DECIMAL))`,
        })
        .from(wholesaleOrders)
        .where(whereClause);

    return {
        orders,
        total,
        totalDue: parseFloat(dueResult[0]?.totalDue || "0"),
    };
};

// Get total outstanding due for a specific DSR (sum of customer dues)
export const getDsrTotalDue = async (dsrId: number) => {
    // Get all orders for this DSR
    const orders = await db
        .select({ id: wholesaleOrders.id })
        .from(wholesaleOrders)
        .where(
            and(
                eq(wholesaleOrders.dsrId, dsrId),
                ne(wholesaleOrders.status, "cancelled"),
                ne(wholesaleOrders.status, "return")
            )
        );

    const orderIds = orders.map(o => o.id);

    if (orderIds.length === 0) {
        return {
            dsrId,
            totalDue: 0,
            orderCount: 0,
        };
    }

    // Calculate total due as sum of customer dues (what DSR needs to collect)
    // Subtract collectedAmount to reflect already collected dues
    const customerDuesResult = await db.query.orderCustomerDues.findMany({
        where: (d, { inArray }) => inArray(d.orderId, orderIds),
    });

    const totalDue = customerDuesResult.reduce(
        (sum, d) => sum + (parseFloat(d.amount) - parseFloat(d.collectedAmount)),
        0
    );

    return {
        dsrId,
        totalDue,
        orderCount: orders.length,
    };
};

// ==================== ORDER ADJUSTMENTS ====================

// Save order adjustment (payments, expenses, item returns)
export const saveOrderAdjustment = async (
    orderId: number,
    data: SaveAdjustmentInput
) => {
    return await db.transaction(async (tx) => {
        // Get the order with items (need batchId for stock updates)
        const order = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, orderId),
            with: { items: true },
        }) as any;

        if (!order) {
            throw new Error("Order not found");
        }

        // Create a map of order items for quick lookup
        const orderItemsMap = new Map<number, { batchId: number; unit: string }>();
        for (const item of order.items) {
            orderItemsMap.set(item.id, { batchId: item.batchId, unit: item.unit });
        }

        // Get existing returns BEFORE deleting (to reverse their stock impact)
        const existingReturns = await tx.query.orderItemReturns.findMany({
            where: (returns, { eq }) => eq(returns.orderId, orderId),
        });

        // Reverse existing returns (subtract quantities from stock - undoing previous addition)
        for (const existingReturn of existingReturns) {
            if (existingReturn.returnQuantity > 0 || existingReturn.returnFreeQuantity > 0) {
                const orderItem = orderItemsMap.get(existingReturn.orderItemId);
                if (orderItem) {
                    // Get unit multiplier for the item
                    const unitMultiplier = FALLBACK_UNIT_MULTIPLIERS[orderItem.unit.toUpperCase()] || 1;
                    const returnQtyInBase = existingReturn.returnQuantity * unitMultiplier;
                    const returnFreeQtyInBase = existingReturn.returnFreeQuantity;

                    // Subtract from stock (undo the previous return's stock increase)
                    await tx
                        .update(stockBatch)
                        .set({
                            remainingQuantity: sql`${stockBatch.remainingQuantity} - ${returnQtyInBase}`,
                            remainingFreeQty: sql`${stockBatch.remainingFreeQty} - ${returnFreeQtyInBase}`,
                        })
                        .where(eq(stockBatch.id, orderItem.batchId));
                }
            }
        }

        // Delete existing payments, expenses, item returns, customer dues, and damage items for this order
        await tx.delete(orderPayments).where(eq(orderPayments.orderId, orderId));
        await tx.delete(orderExpenses).where(eq(orderExpenses.orderId, orderId));
        await tx.delete(orderItemReturns).where(eq(orderItemReturns.orderId, orderId));
        await tx.delete(orderCustomerDues).where(eq(orderCustomerDues.orderId, orderId));
        await tx.delete(orderDamageItems).where(eq(orderDamageItems.orderId, orderId));

        let totalPayments = 0;
        let totalExpensesAmount = 0;
        let totalReturnsAmount = 0;
        let totalCustomerDuesAmount = 0;
        let totalDamageAmount = 0;

        // Insert new payments
        for (const payment of data.payments) {
            if (payment.amount > 0) {
                await tx.insert(orderPayments).values({
                    orderId,
                    amount: payment.amount.toFixed(2),
                    paymentDate: data.paymentDate,
                    paymentMethod: payment.method,
                    note: payment.note || null,
                });
                totalPayments += payment.amount;
            }
        }

        // Insert new expenses
        for (const expense of data.expenses) {
            if (expense.amount > 0) {
                await tx.insert(orderExpenses).values({
                    orderId,
                    amount: expense.amount.toFixed(2),
                    expenseType: expense.type,
                    note: expense.note || null,
                });
                totalExpensesAmount += expense.amount;
            }
        }

        // Insert new customer dues
        for (const customerDue of data.customerDues) {
            if (customerDue.amount > 0) {
                await tx.insert(orderCustomerDues).values({
                    orderId,
                    customerId: customerDue.customerId || null,
                    customerName: customerDue.customerName,
                    amount: customerDue.amount.toFixed(2),
                });
                totalCustomerDuesAmount += customerDue.amount;
            }
        }

        // Insert new item returns (also stores discount per item) and update stock
        for (const itemReturn of data.itemReturns) {
            // Create record if there's a return OR discount
            if (itemReturn.returnQuantity > 0 || itemReturn.returnFreeQuantity > 0 || itemReturn.adjustmentDiscount > 0) {
                await tx.insert(orderItemReturns).values({
                    orderId,
                    orderItemId: itemReturn.itemId,
                    returnQuantity: itemReturn.returnQuantity,
                    returnUnit: itemReturn.returnUnit,
                    returnFreeQuantity: itemReturn.returnFreeQuantity,
                    returnAmount: itemReturn.returnAmount.toFixed(2),
                    adjustmentDiscount: itemReturn.adjustmentDiscount.toFixed(2),
                });
                totalReturnsAmount += itemReturn.returnAmount;

                // Subtract new return quantities from stock
                if (itemReturn.returnQuantity > 0 || itemReturn.returnFreeQuantity > 0) {
                    const orderItem = orderItemsMap.get(itemReturn.itemId);
                    if (orderItem) {
                        const unitMultiplier = FALLBACK_UNIT_MULTIPLIERS[orderItem.unit.toUpperCase()] || 1;
                        const returnQtyInBase = itemReturn.returnQuantity * unitMultiplier;
                        const returnFreeQtyInBase = itemReturn.returnFreeQuantity;

                        // Subtract from stock (returns are still "out" of stock until processed)
                        // Actually, RETURNED items should be ADDED back to stock!
                        await tx
                            .update(stockBatch)
                            .set({
                                remainingQuantity: sql`${stockBatch.remainingQuantity} + ${returnQtyInBase}`,
                                remainingFreeQty: sql`${stockBatch.remainingFreeQty} + ${returnFreeQtyInBase}`,
                            })
                            .where(eq(stockBatch.id, orderItem.batchId));
                    }
                }
            }
        }

        // Insert new damage items
        for (const damageItem of data.damageReturns || []) {
            if (damageItem.quantity > 0) {
                const total = damageItem.quantity * damageItem.unitPrice;
                await tx.insert(orderDamageItems).values({
                    orderId,
                    orderItemId: damageItem.orderItemId || null,
                    productId: damageItem.productId || null,
                    variantId: damageItem.variantId || null,
                    productName: damageItem.productName,
                    variantName: damageItem.variantName || null,
                    brandName: damageItem.brandName,
                    quantity: damageItem.quantity,
                    unitPrice: damageItem.unitPrice.toFixed(2),
                    total: total.toFixed(2),
                    reason: damageItem.reason || null,
                });
                totalDamageAmount += total;
            }
        }

        // Update order with calculated values and set status to "adjusted"
        await tx
            .update(wholesaleOrders)
            .set({
                paidAmount: totalPayments.toFixed(2),
                status: "adjusted",
            })
            .where(eq(wholesaleOrders.id, orderId));

        // Return updated order with adjustment data
        return await getOrderAdjustment(orderId);
    });
};

// Get order adjustment data with all calculated values
export const getOrderAdjustment = async (orderId: number) => {
    const order = await db.query.wholesaleOrders.findFirst({
        where: (orders, { eq }) => eq(orders.id, orderId),
        with: {
            items: {
                with: {
                    product: true,
                    brand: true,
                    batch: true,
                },
            },
            dsr: true,
            route: true,
        },
    }) as any; // Type assertion needed because Drizzle's query type inference doesn't include relations

    if (!order) {
        return undefined;
    }

    // Get payments
    const payments = await db.query.orderPayments.findMany({
        where: (p, { eq }) => eq(p.orderId, orderId),
    });

    // Get expenses
    const expenses = await db.query.orderExpenses.findMany({
        where: (e, { eq }) => eq(e.orderId, orderId),
    });

    // Get item returns
    const itemReturnsData = await db.query.orderItemReturns.findMany({
        where: (r, { eq }) => eq(r.orderId, orderId),
    });

    // Get customer dues
    const customerDuesData = await db.query.orderCustomerDues.findMany({
        where: (d, { eq }) => eq(d.orderId, orderId),
    });

    // Get damage items
    const damageItemsData = await db.query.orderDamageItems.findMany({
        where: (d, { eq }) => eq(d.orderId, orderId),
    });

    // Calculate totals
    const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalReturns = itemReturnsData.reduce((sum, r) => sum + parseFloat(r.returnAmount), 0);
    const totalCustomerDues = customerDuesData.reduce((sum, d) => sum + (parseFloat(d.amount) - parseFloat(d.collectedAmount)), 0);
    const totalAdjustmentDiscount = itemReturnsData.reduce((sum, r) => sum + parseFloat(r.adjustmentDiscount || "0"), 0);

    // Calculate per-item net values
    const itemsWithCalculations = await Promise.all(
        (order.items as any[]).map(async (item) => {
            const itemReturn = itemReturnsData.find((r) => r.orderItemId === item.id);
            const returnQuantity = itemReturn?.returnQuantity ?? 0;
            const returnUnit = itemReturn?.returnUnit ?? "PCS";
            const returnFreeQuantity = itemReturn?.returnFreeQuantity ?? 0;
            const returnAmount = itemReturn ? parseFloat(itemReturn.returnAmount) : 0;
            const adjustmentDiscount = itemReturn ? parseFloat(itemReturn.adjustmentDiscount || "0") : 0;

            // Get unit multiplier for return unit
            const unitMultiplier = await getUnitMultiplier(returnUnit);
            const returnQtyInBase = returnQuantity * unitMultiplier;

            // Use totalQuantity which already includes (qty × multiplier) + extraPieces + freeQty
            const originalTotalQty = item.totalQuantity ?? item.quantity;
            const extraPieces = item.extraPieces ?? 0;

            // Calculate paid quantity = totalQuantity - freeQuantity
            const paidQty = originalTotalQty - item.freeQuantity;

            // Calculate net values (subtract returns from total quantity)
            const netQuantity = Math.max(0, paidQty - returnQtyInBase);
            const netFreeQuantity = Math.max(0, item.freeQuantity - returnFreeQuantity);
            const salePrice = parseFloat(item.salePrice);
            // Net total = (netQuantity × salePrice) - adjustmentDiscount
            const netTotal = Math.max(0, (netQuantity * salePrice) - adjustmentDiscount);

            return {
                id: item.id,
                productId: item.productId,
                productName: item.product?.name,
                brandId: item.brandId,
                brandName: item.brand?.name,
                quantity: item.quantity,
                unit: item.unit,
                extraPieces: extraPieces,
                totalQuantity: originalTotalQty,
                freeQuantity: item.freeQuantity,
                salePrice: item.salePrice,
                discount: item.discount,
                net: item.net,
                // Return values
                returnQuantity,
                returnUnit,
                returnFreeQuantity,
                returnAmount,
                // Adjustment discount
                adjustmentDiscount,
                // Net values (calculated)
                netQuantity,
                netFreeQuantity,
                netTotal,
            };
        })
    );

    // Calculate summary totals
    const subtotal = (order.items as any[]).reduce((sum, item) => sum + parseFloat(item.net), 0);
    const orderTotal = parseFloat(order.total);
    const netTotalAfterReturns = itemsWithCalculations.reduce((sum, item) => sum + item.netTotal, 0);

    // Adjustment = Payments + Expenses + Customer Dues (all reduce what's owed)
    const totalAdjustment = totalPayments + totalExpenses + totalCustomerDues;
    const due = Math.max(0, netTotalAfterReturns - totalAdjustment);

    return {
        order,
        payments: payments.map(p => ({
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.paymentMethod || "cash",
            note: p.note || undefined,
        })),
        expenses: expenses.map(e => ({
            id: e.id,
            amount: parseFloat(e.amount),
            type: e.expenseType,
            note: e.note || undefined,
        })),
        customerDues: customerDuesData.map(d => ({
            id: d.id,
            customerId: d.customerId || undefined,
            customerName: d.customerName,
            amount: parseFloat(d.amount),
        })),
        itemReturns: itemReturnsData.map(r => ({
            id: r.id,
            itemId: r.orderItemId,
            returnQuantity: r.returnQuantity,
            returnUnit: r.returnUnit,
            returnFreeQuantity: r.returnFreeQuantity,
            returnAmount: parseFloat(r.returnAmount),
            adjustmentDiscount: parseFloat(r.adjustmentDiscount || "0"),
        })),
        damageReturns: damageItemsData.map(d => ({
            id: d.id,
            orderItemId: d.orderItemId || undefined,
            productId: d.productId || undefined,
            variantId: d.variantId || undefined,
            productName: d.productName,
            variantName: d.variantName || undefined,
            brandName: d.brandName,
            quantity: d.quantity,
            unitPrice: parseFloat(d.unitPrice),
            reason: d.reason || undefined,
        })),
        // New: Items with pre-calculated values
        itemsWithCalculations,
        // New: Summary with all totals
        summary: {
            subtotal,
            discount: parseFloat(order.discount),
            total: orderTotal,
            totalReturns,
            totalAdjustmentDiscount,
            netTotal: netTotalAfterReturns,
            totalPayments,
            totalExpenses,
            totalCustomerDues,
            totalAdjustment,
            due,
        },
    };
};

// ==================== OVERDUE PENDING ORDERS ====================

/**
 * Get pending orders that are overdue (older than threshold days without adjustment)
 */
export const getOverduePendingOrders = async (thresholdDays: number) => {
    // Calculate the cutoff date (orders before this date are considered overdue)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);
    const cutoffDateStr: string = cutoffDate.toISOString().split("T")[0] as string;

    const orders = await db.query.wholesaleOrders.findMany({
        where: and(
            eq(wholesaleOrders.status, "pending"),
            lte(wholesaleOrders.orderDate, cutoffDateStr)

        ),
        with: {
            dsr: true,
            route: true,
        },
        orderBy: (orders, { asc }) => [asc(orders.orderDate)],
    });

    // Transform orders to include days overdue
    const today = new Date();
    const transformedOrders = orders.map((order: any) => {
        const orderDate = new Date(order.orderDate);
        const diffTime = today.getTime() - orderDate.getTime();
        const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return {
            id: order.id,
            orderNumber: order.orderNumber,
            dsrId: order.dsrId,
            dsrName: order.dsr?.name,
            routeId: order.routeId,
            routeName: order.route?.name,
            orderDate: order.orderDate,
            total: order.total,
            status: order.status,
            daysOverdue,
            createdAt: order.createdAt,
        };
    });

    return {
        orders: transformedOrders,
        total: transformedOrders.length,
        thresholdDays,
    };
};
