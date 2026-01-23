import { z } from "zod";

// Order status types - simplified to pending and adjusted
export const ORDER_STATUSES = ["pending", "adjusted"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

// Order item schema
export const orderItemSchema = z.object({
    productId: z.coerce.number().int("Product ID must be an integer").positive("Product ID must be positive"),
    batchId: z.coerce.number().int("Batch ID must be an integer").positive("Batch ID must be positive"),
    brandId: z.coerce.number().int("Brand ID must be an integer").positive("Brand ID must be positive"),
    quantity: z.coerce.number().int("Quantity must be an integer").positive("Quantity must be greater than 0"),
    unit: z.string().min(1, "Unit is required"),
    totalQuantity: z.coerce.number().int("Total quantity must be an integer").nonnegative("Total quantity cannot be negative"),
    availableQuantity: z.coerce.number().int("Available quantity must be an integer").nonnegative("Available quantity cannot be negative").default(0),
    freeQuantity: z.coerce.number().int("Free quantity must be an integer").nonnegative("Free quantity cannot be negative").default(0),
    extraPieces: z.coerce.number().int("Extra pieces must be an integer").nonnegative("Extra pieces cannot be negative").default(0),
    salePrice: z.coerce.number().positive("Sale price must be greater than 0"),
    discount: z.coerce.number().nonnegative("Discount must be non-negative").default(0),
});

// Create order schema
export const createOrderSchema = z.object({
    dsrId: z.coerce.number().int("DSR ID must be an integer").positive("DSR ID must be positive"),
    routeId: z.coerce.number().int("Route ID must be an integer").positive("Route ID must be positive"),
    orderDate: z.string().min(1, "Order date is required"),
    categoryId: z.coerce.number().int("Category ID must be an integer").positive("Category ID must be positive").optional(),
    brandId: z.coerce.number().int("Brand ID must be an integer").positive("Brand ID must be positive").optional(),
    invoiceNote: z.string().optional(),
    items: z.array(orderItemSchema).min(1, "At least one item is required"),
});

// Update order schema (same as create for full replacement)
export const updateOrderSchema = createOrderSchema;

// Update order status schema
export const updateStatusSchema = z.object({
    status: z.enum(ORDER_STATUSES, {
        message: "Status must be one of: pending, adjusted"
    }),
});



// Query parameters schema
export const getOrdersQuerySchema = z.object({
    search: z.string().optional(),
    dsrId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    routeId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    categoryId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    brandId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    status: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
    offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});



// Due orders query schema
export const getDueOrdersQuerySchema = z.object({
    dsrId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    routeId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
    offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

// Type exports
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type GetOrdersQuery = z.infer<typeof getOrdersQuerySchema>;
export type GetDueOrdersQuery = z.infer<typeof getDueOrdersQuerySchema>;

// ==================== ORDER ADJUSTMENT SCHEMAS ====================

// Payment entry schema for adjustments
export const adjustmentPaymentSchema = z.object({
    amount: z.coerce.number().nonnegative("Amount must be non-negative"),
    method: z.string().min(1, "Payment method is required"),
    note: z.string().optional(),
});

// Expense entry schema for adjustments
export const adjustmentExpenseSchema = z.object({
    amount: z.coerce.number().nonnegative("Amount must be non-negative"),
    type: z.string().min(1, "Expense type is required"),
    note: z.string().optional(),
});

// Item return schema for adjustments
export const adjustmentItemReturnSchema = z.object({
    itemId: z.coerce.number().int().positive("Item ID must be positive"),
    returnQuantity: z.coerce.number().int().nonnegative("Return quantity must be non-negative"),
    returnUnit: z.string().min(1, "Return unit is required"),
    returnFreeQuantity: z.coerce.number().int().nonnegative("Return free quantity must be non-negative").default(0),
    returnAmount: z.coerce.number().nonnegative("Return amount must be non-negative").default(0),
    adjustmentDiscount: z.coerce.number().nonnegative("Adjustment discount must be non-negative").default(0),
});

// Customer due schema for adjustments
export const adjustmentCustomerDueSchema = z.object({
    customerId: z.coerce.number().int().positive("Customer ID must be positive").optional(),
    customerName: z.string().min(1, "Customer name is required"),
    amount: z.coerce.number().nonnegative("Amount must be non-negative"),
});

// Damage return schema for adjustments
export const adjustmentDamageReturnSchema = z.object({
    orderItemId: z.coerce.number().int().positive().optional(), // Optional - only if from order item
    productId: z.coerce.number().int().positive().optional(),   // Product ID for any product
    variantId: z.coerce.number().int().positive().optional(),   // Variant ID
    productName: z.string().min(1, "Product name is required"),
    variantName: z.string().optional(), // Variant label (e.g., "100G")
    brandName: z.string().min(1, "Brand name is required"),
    quantity: z.coerce.number().int().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().nonnegative("Unit price must be non-negative"),
    reason: z.string().optional(),
});

// Complete adjustment save schema
export const saveAdjustmentSchema = z.object({
    payments: z.array(adjustmentPaymentSchema).default([]),
    expenses: z.array(adjustmentExpenseSchema).default([]),
    customerDues: z.array(adjustmentCustomerDueSchema).default([]),
    damageReturns: z.array(adjustmentDamageReturnSchema).default([]),
    itemReturns: z.array(adjustmentItemReturnSchema).default([]),
    paymentDate: z.string().min(1, "Payment date is required"),
});

export type AdjustmentPaymentInput = z.infer<typeof adjustmentPaymentSchema>;
export type AdjustmentExpenseInput = z.infer<typeof adjustmentExpenseSchema>;
export type AdjustmentCustomerDueInput = z.infer<typeof adjustmentCustomerDueSchema>;
export type AdjustmentDamageReturnInput = z.infer<typeof adjustmentDamageReturnSchema>;
export type AdjustmentItemReturnInput = z.infer<typeof adjustmentItemReturnSchema>;
export type SaveAdjustmentInput = z.infer<typeof saveAdjustmentSchema>;
