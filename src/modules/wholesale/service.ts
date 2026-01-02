import { db } from "../../db/config";
import { wholesaleOrders, wholesaleOrderItems, stockBatch, orderPayments, orderExpenses, orderItemReturns } from "../../db/schema";
import { eq, and, or, ilike, count, gte, lte, sql } from "drizzle-orm";
import type { CreateOrderInput, UpdateOrderInput, GetOrdersQuery, OrderItemInput, PartialCompleteInput, SaveAdjustmentInput } from "./validation";
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
    const subtotal = item.quantity * salePrice;
    const net = subtotal - item.discount;
    const multiplier = await getUnitMultiplier(item.unit);
    const totalQuantity = item.quantity * multiplier;

    return {
        subtotal: subtotal.toFixed(2),
        net: net.toFixed(2),
        totalQuantity,
        salePrice,
    };
};

// Helper function to calculate order totals
const calculateOrderTotals = (items: Array<{ quantity: number; salePrice: number; discount: number }>) => {
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
        const totals = calculateOrderTotals(itemsWithBatchData);

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
            },
        }),
        db
            .select({ count: count() })
            .from(wholesaleOrders)
            .where(whereClause),
    ]);

    // Transform orders to include item count and proper naming
    // Type assertion needed because Drizzle's query type inference doesn't include relations properly
    const transformedOrders = orders.map((order: any) => ({
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
        paidAmount: order.paidAmount,
        paymentStatus: order.paymentStatus,
        status: order.status,
        itemCount: order.items?.length || 0,
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
                    batch: true,
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
        const totals = calculateOrderTotals(itemsWithBatchData);

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

// Update order status
export const updateOrderStatus = async (
    id: number,
    status: string
): Promise<OrderWithItems | undefined> => {
    return await db.transaction(async (tx) => {
        // Check if order exists with items
        const existingOrder = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
            with: { items: true },
        }) as any;

        if (!existingOrder) {
            return undefined;
        }

        // If changing to "return" status, restock ALL items
        if (status === "return" && existingOrder.status !== "return") {
            for (const item of existingOrder.items) {
                // Restore full quantity and free quantity to batch
                await tx
                    .update(stockBatch)
                    .set({
                        remainingQuantity: sql`${stockBatch.remainingQuantity} + ${item.quantity}`,
                        remainingFreeQty: sql`${stockBatch.remainingFreeQty} + ${item.freeQuantity}`,
                    })
                    .where(eq(stockBatch.id, item.batchId));
            }
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

// Complete order partially - restore undelivered stock to batches
export const completeOrderPartially = async (
    orderId: number,
    input: PartialCompleteInput
): Promise<OrderWithItems | undefined> => {
    return await db.transaction(async (tx) => {
        // Get the order with items
        const order = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, orderId),
            with: { items: true },
        }) as any;

        if (!order) {
            throw new Error("Order not found");
        }

        if (order.status !== "pending") {
            throw new Error("Only pending orders can be partially completed");
        }

        let newGrandTotal = 0;

        // Process each item
        for (const inputItem of input.items) {
            const orderItem = order.items.find((item: any) => item.id === inputItem.itemId);
            if (!orderItem) {
                throw new Error(`Order item ${inputItem.itemId} not found`);
            }

            // Validate delivered quantities
            if (inputItem.deliveredQuantity > orderItem.quantity) {
                throw new Error(`Delivered quantity cannot exceed ordered quantity for item ${inputItem.itemId}`);
            }
            if (inputItem.deliveredFreeQty > orderItem.freeQuantity) {
                throw new Error(`Delivered free quantity cannot exceed ordered free quantity for item ${inputItem.itemId}`);
            }

            // Calculate quantities to restore
            const qtyToRestore = orderItem.quantity - inputItem.deliveredQuantity;
            const freeQtyToRestore = orderItem.freeQuantity - inputItem.deliveredFreeQty;

            // Restore stock to batch if any
            if (qtyToRestore > 0 || freeQtyToRestore > 0) {
                await tx
                    .update(stockBatch)
                    .set({
                        remainingQuantity: sql`${stockBatch.remainingQuantity} + ${qtyToRestore}`,
                        remainingFreeQty: sql`${stockBatch.remainingFreeQty} + ${freeQtyToRestore}`,
                    })
                    .where(eq(stockBatch.id, orderItem.batchId));
            }

            // Calculate new item totals based on delivered quantity
            const salePrice = parseFloat(orderItem.salePrice);
            const discount = parseFloat(orderItem.discount);
            const newSubtotal = inputItem.deliveredQuantity * salePrice;
            const newNet = newSubtotal - discount;

            // Update order item with delivered quantities
            await tx
                .update(wholesaleOrderItems)
                .set({
                    deliveredQuantity: inputItem.deliveredQuantity,
                    deliveredFreeQty: inputItem.deliveredFreeQty,
                    subtotal: newSubtotal.toFixed(2),
                    net: newNet.toFixed(2),
                })
                .where(eq(wholesaleOrderItems.id, inputItem.itemId));

            newGrandTotal += newNet;
        }

        // Update order status to partial and update total
        await tx
            .update(wholesaleOrders)
            .set({
                status: "partial",
                total: newGrandTotal.toFixed(2),
            })
            .where(eq(wholesaleOrders.id, orderId));

        // Fetch and return updated order
        const updatedOrder = await tx.query.wholesaleOrders.findFirst({
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
                category: true,
                brand: true,
            },
        });

        return updatedOrder as OrderWithItems | undefined;
    });
};

// Record a payment for an order
export const recordPayment = async (
    orderId: number,
    amount: number,
    paymentDate: string,
    paymentMethod?: string,
    note?: string,
    collectedBy?: string,
    collectedByDsrId?: number
) => {
    return await db.transaction(async (tx) => {
        // Get the order
        const order = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, orderId),
        });

        if (!order) {
            throw new Error("Order not found");
        }

        const total = parseFloat(order.total);
        const currentPaid = parseFloat(order.paidAmount);
        const newPaidAmount = currentPaid + amount;

        if (newPaidAmount > total) {
            throw new Error(`Payment amount exceeds remaining due. Max allowed: ${(total - currentPaid).toFixed(2)}`);
        }

        // Determine payment status
        let paymentStatus: string;
        if (newPaidAmount >= total) {
            paymentStatus = "paid";
        } else if (newPaidAmount > 0) {
            paymentStatus = "partial";
        } else {
            paymentStatus = "unpaid";
        }

        // Record the payment
        await tx.insert(orderPayments).values({
            orderId,
            amount: amount.toFixed(2),
            paymentDate,
            paymentMethod: paymentMethod || null,
            note: note || null,
            collectedBy: collectedBy || null,
            collectedByDsrId: collectedByDsrId || null,
        });

        // Update order paid amount, payment status, and order status if fully paid
        const updateData: any = {
            paidAmount: newPaidAmount.toFixed(2),
            paymentStatus,
        };

        // If order is "due" and now fully paid, change status to "completed"
        if (order.status === "due" && newPaidAmount >= total) {
            updateData.status = "completed";
        }

        await tx
            .update(wholesaleOrders)
            .set(updateData)
            .where(eq(wholesaleOrders.id, orderId));

        // Return updated order
        const updatedOrder = await tx.query.wholesaleOrders.findFirst({
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

// Get orders with outstanding dues
export const getDueOrders = async (params: {
    dsrId?: number;
    routeId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}) => {
    const conditions: any[] = [];

    // Only orders with status = "due" (pending payment)
    conditions.push(eq(wholesaleOrders.status, "due"));

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

// Get total outstanding due for a specific DSR
export const getDsrTotalDue = async (dsrId: number) => {
    // Calculate total due = SUM(total - paidAmount) for all orders where there's still unpaid amount
    const result = await db
        .select({
            totalDue: sql<string>`COALESCE(SUM(CAST(${wholesaleOrders.total} AS DECIMAL) - CAST(${wholesaleOrders.paidAmount} AS DECIMAL)), 0)`,
            orderCount: count(),
        })
        .from(wholesaleOrders)
        .where(
            and(
                eq(wholesaleOrders.dsrId, dsrId),
                // Only include orders that have outstanding balance (payment not complete)
                sql`CAST(${wholesaleOrders.total} AS DECIMAL) > CAST(${wholesaleOrders.paidAmount} AS DECIMAL)`
            )
        );

    return {
        dsrId,
        totalDue: parseFloat(result[0]?.totalDue || "0"),
        orderCount: result[0]?.orderCount || 0,
    };
};

// ==================== ORDER ADJUSTMENTS ====================

// Save order adjustment (payments, expenses, item returns)
export const saveOrderAdjustment = async (
    orderId: number,
    data: SaveAdjustmentInput
) => {
    return await db.transaction(async (tx) => {
        // Get the order
        const order = await tx.query.wholesaleOrders.findFirst({
            where: (orders, { eq }) => eq(orders.id, orderId),
            with: { items: true },
        }) as any;

        if (!order) {
            throw new Error("Order not found");
        }

        // Delete existing payments, expenses, and item returns for this order
        await tx.delete(orderPayments).where(eq(orderPayments.orderId, orderId));
        await tx.delete(orderExpenses).where(eq(orderExpenses.orderId, orderId));
        await tx.delete(orderItemReturns).where(eq(orderItemReturns.orderId, orderId));

        let totalPayments = 0;
        let totalExpensesAmount = 0;
        let totalReturnsAmount = 0;

        // Insert new payments
        for (const payment of data.payments) {
            if (payment.amount > 0) {
                await tx.insert(orderPayments).values({
                    orderId,
                    amount: payment.amount.toFixed(2),
                    paymentDate: data.paymentDate,
                    paymentMethod: payment.method,
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
                });
                totalExpensesAmount += expense.amount;
            }
        }

        // Insert new item returns
        for (const itemReturn of data.itemReturns) {
            if (itemReturn.returnQuantity > 0 || itemReturn.returnFreeQuantity > 0) {
                await tx.insert(orderItemReturns).values({
                    orderId,
                    orderItemId: itemReturn.itemId,
                    returnQuantity: itemReturn.returnQuantity,
                    returnUnit: itemReturn.returnUnit,
                    returnFreeQuantity: itemReturn.returnFreeQuantity,
                    returnAmount: itemReturn.returnAmount.toFixed(2),
                });
                totalReturnsAmount += itemReturn.returnAmount;
            }
        }

        // Calculate new paid amount and payment status
        const orderTotal = parseFloat(order.total);
        const adjustedTotal = orderTotal - totalReturnsAmount;
        const netAdjustment = totalPayments - totalExpensesAmount;
        const amountDue = Math.max(0, adjustedTotal - netAdjustment);

        let paymentStatus = "unpaid";
        if (amountDue <= 0) {
            paymentStatus = "paid";
        } else if (totalPayments > 0) {
            paymentStatus = "partial";
        }

        // Update order with calculated values
        await tx
            .update(wholesaleOrders)
            .set({
                paidAmount: totalPayments.toFixed(2),
                paymentStatus,
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

    // Calculate totals
    const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const totalReturns = itemReturnsData.reduce((sum, r) => sum + parseFloat(r.returnAmount), 0);

    // Calculate per-item net values
    const itemsWithCalculations = await Promise.all(
        (order.items as any[]).map(async (item) => {
            const itemReturn = itemReturnsData.find((r) => r.orderItemId === item.id);
            const returnQuantity = itemReturn?.returnQuantity ?? 0;
            const returnUnit = itemReturn?.returnUnit ?? "PCS";
            const returnFreeQuantity = itemReturn?.returnFreeQuantity ?? 0;
            const returnAmount = itemReturn ? parseFloat(itemReturn.returnAmount) : 0;

            // Get unit multiplier for return unit
            const unitMultiplier = await getUnitMultiplier(returnUnit);
            const returnQtyInBase = returnQuantity * unitMultiplier;

            // Calculate net values
            const netQuantity = Math.max(0, item.quantity - returnQtyInBase);
            const netFreeQuantity = Math.max(0, item.freeQuantity - returnFreeQuantity);
            const salePrice = parseFloat(item.salePrice);
            const netTotal = netQuantity * salePrice;

            return {
                id: item.id,
                productId: item.productId,
                productName: item.product?.name,
                brandId: item.brandId,
                brandName: item.brand?.name,
                quantity: item.quantity,
                unit: item.unit,
                freeQuantity: item.freeQuantity,
                salePrice: item.salePrice,
                discount: item.discount,
                net: item.net,
                // Return values
                returnQuantity,
                returnUnit,
                returnFreeQuantity,
                returnAmount,
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

    // Adjustment = Payments + Expenses (both reduce what's owed)
    const totalAdjustment = totalPayments + totalExpenses;
    const due = Math.max(0, netTotalAfterReturns - totalAdjustment);

    return {
        order,
        payments: payments.map(p => ({
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.paymentMethod || "cash",
        })),
        expenses: expenses.map(e => ({
            id: e.id,
            amount: parseFloat(e.amount),
            type: e.expenseType,
        })),
        itemReturns: itemReturnsData.map(r => ({
            id: r.id,
            itemId: r.orderItemId,
            returnQuantity: r.returnQuantity,
            returnUnit: r.returnUnit,
            returnFreeQuantity: r.returnFreeQuantity,
            returnAmount: parseFloat(r.returnAmount),
        })),
        // New: Items with pre-calculated values
        itemsWithCalculations,
        // New: Summary with all totals
        summary: {
            subtotal,
            discount: parseFloat(order.discount),
            total: orderTotal,
            totalReturns,
            netTotal: netTotalAfterReturns,
            totalPayments,
            totalExpenses,
            totalAdjustment,
            due,
        },
    };
};
