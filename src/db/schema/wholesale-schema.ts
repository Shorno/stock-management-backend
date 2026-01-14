import { pgTable, serial, varchar, integer, decimal, text, date, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";
import { category, brand, product, stockBatch, productVariant } from "./product-schema";

export const dsr = pgTable("dsr", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    ...timestamps
});

export const route = pgTable("route", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    ...timestamps
});

export const dsrTarget = pgTable("dsr_target", {
    id: serial("id").primaryKey(),
    dsrId: integer("dsr_id")
        .notNull()
        .references(() => dsr.id, { onDelete: "cascade" }),
    targetMonth: date("target_month").notNull(), // First day of the month
    targetAmount: decimal("target_amount", { precision: 12, scale: 2 }).notNull(),
    ...timestamps
}, (table) => ({
    dsrIdx: index("idx_dsr_target_dsr").on(table.dsrId),
    monthIdx: index("idx_dsr_target_month").on(table.targetMonth),
    uniqueDsrMonth: index("idx_dsr_target_dsr_month").on(table.dsrId, table.targetMonth),
}));

export const customer = pgTable("customer", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    shopName: varchar("shop_name", { length: 150 }),
    mobile: varchar("mobile", { length: 20 }),
    address: text("address"),
    routeId: integer("route_id")
        .references(() => route.id, { onDelete: "set null" }),
    ...timestamps
}, (table) => ({
    nameIdx: index("idx_customer_name").on(table.name),
    routeIdx: index("idx_customer_route").on(table.routeId),
    mobileIdx: index("idx_customer_mobile").on(table.mobile),
}));

export const customerRelations = relations(customer, ({ one }) => ({
    route: one(route, {
        fields: [customer.routeId],
        references: [route.id],
    }),
}));

export const wholesaleOrders = pgTable("wholesale_orders", {
    id: serial("id").primaryKey(),
    orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
    dsrId: integer("dsr_id")
        .notNull()
        .references(() => dsr.id, { onDelete: "restrict" }),
    routeId: integer("route_id")
        .notNull()
        .references(() => route.id, { onDelete: "restrict" }),
    orderDate: date("order_date").notNull(),
    categoryId: integer("category_id")
        .references(() => category.id, { onDelete: "set null" }),
    brandId: integer("brand_id")
        .references(() => brand.id, { onDelete: "set null" }),
    invoiceNote: text("invoice_note"),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0"),
    total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
    paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("unpaid"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    ...timestamps
}, (table) => ({
    dsrIdx: index("idx_wholesale_orders_dsr").on(table.dsrId),
    routeIdx: index("idx_wholesale_orders_route").on(table.routeId),
    dateIdx: index("idx_wholesale_orders_date").on(table.orderDate),
    statusIdx: index("idx_wholesale_orders_status").on(table.status),
    paymentStatusIdx: index("idx_wholesale_orders_payment_status").on(table.paymentStatus),
    orderNumberIdx: index("idx_wholesale_orders_order_number").on(table.orderNumber),
}));

export const wholesaleOrderItems = pgTable("wholesale_order_items", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
        .notNull()
        .references(() => wholesaleOrders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
        .notNull()
        .references(() => product.id, { onDelete: "restrict" }),
    batchId: integer("batch_id")
        .notNull()
        .references(() => stockBatch.id, { onDelete: "restrict" }),
    brandId: integer("brand_id")
        .notNull()
        .references(() => brand.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    totalQuantity: integer("total_quantity").notNull(),
    availableQuantity: integer("available_quantity").notNull().default(0),
    freeQuantity: integer("free_quantity").notNull().default(0),
    // Delivered quantities for partial completion
    deliveredQuantity: integer("delivered_quantity"),
    deliveredFreeQty: integer("delivered_free_qty"),
    salePrice: decimal("sale_price", { precision: 10, scale: 2 }).notNull(),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0"),
    net: decimal("net", { precision: 10, scale: 2 }).notNull(),
    ...timestamps
}, (table) => ({
    orderIdx: index("idx_wholesale_order_items_order").on(table.orderId),
    productIdx: index("idx_wholesale_order_items_product").on(table.productId),
    batchIdx: index("idx_wholesale_order_items_batch").on(table.batchId),
}));

// Relations
export const dsrRelations = relations(dsr, ({ many }) => ({
    wholesaleOrders: many(wholesaleOrders),
    targets: many(dsrTarget),
}));

export const dsrTargetRelations = relations(dsrTarget, ({ one }) => ({
    dsr: one(dsr, {
        fields: [dsrTarget.dsrId],
        references: [dsr.id],
    }),
}));

export const routeRelations = relations(route, ({ many }) => ({
    wholesaleOrders: many(wholesaleOrders),
}));

export const wholesaleOrdersRelations = relations(wholesaleOrders, ({ one, many }) => ({
    dsr: one(dsr, {
        fields: [wholesaleOrders.dsrId],
        references: [dsr.id],
    }),
    route: one(route, {
        fields: [wholesaleOrders.routeId],
        references: [route.id],
    }),
    category: one(category, {
        fields: [wholesaleOrders.categoryId],
        references: [category.id],
    }),
    brand: one(brand, {
        fields: [wholesaleOrders.brandId],
        references: [brand.id],
    }),
    items: many(wholesaleOrderItems),
}));

export const wholesaleOrderItemsRelations = relations(wholesaleOrderItems, ({ one }) => ({
    order: one(wholesaleOrders, {
        fields: [wholesaleOrderItems.orderId],
        references: [wholesaleOrders.id],
    }),
    product: one(product, {
        fields: [wholesaleOrderItems.productId],
        references: [product.id],
    }),
    batch: one(stockBatch, {
        fields: [wholesaleOrderItems.batchId],
        references: [stockBatch.id],
    }),
    brand: one(brand, {
        fields: [wholesaleOrderItems.brandId],
        references: [brand.id],
    }),
}));

// Order Payments table for tracking payment history
export const orderPayments = pgTable("order_payments", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
        .notNull()
        .references(() => wholesaleOrders.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }),
    note: text("note"),
    collectedBy: varchar("collected_by", { length: 100 }), // Legacy - free text
    collectedByDsrId: integer("collected_by_dsr_id")
        .references(() => dsr.id, { onDelete: "set null" }),
    ...timestamps
}, (table) => ({
    orderIdx: index("idx_order_payments_order").on(table.orderId),
    dateIdx: index("idx_order_payments_date").on(table.paymentDate),
    dsrIdx: index("idx_order_payments_dsr").on(table.collectedByDsrId),
}));

// Order payments relations
export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
    order: one(wholesaleOrders, {
        fields: [orderPayments.orderId],
        references: [wholesaleOrders.id],
    }),
    collectedByDsr: one(dsr, {
        fields: [orderPayments.collectedByDsrId],
        references: [dsr.id],
    }),
}));

// Update wholesaleOrders relations to include payments
export const wholesaleOrdersPaymentRelation = relations(wholesaleOrders, ({ many }) => ({
    payments: many(orderPayments),
}));

// ==================== ORDER EXPENSES ====================

export const orderExpenses = pgTable("order_expenses", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
        .notNull()
        .references(() => wholesaleOrders.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    expenseType: varchar("expense_type", { length: 50 }).notNull(), // transport, food, commission, other
    note: text("note"),
    ...timestamps
}, (table) => ({
    orderIdx: index("idx_order_expenses_order").on(table.orderId),
}));

// Order expenses relations
export const orderExpensesRelations = relations(orderExpenses, ({ one }) => ({
    order: one(wholesaleOrders, {
        fields: [orderExpenses.orderId],
        references: [wholesaleOrders.id],
    }),
}));

// ==================== ORDER ITEM RETURNS ====================

export const orderItemReturns = pgTable("order_item_returns", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
        .notNull()
        .references(() => wholesaleOrders.id, { onDelete: "cascade" }),
    orderItemId: integer("order_item_id")
        .notNull()
        .references(() => wholesaleOrderItems.id, { onDelete: "cascade" }),
    returnQuantity: integer("return_quantity").notNull().default(0),
    returnUnit: varchar("return_unit", { length: 20 }).notNull(),
    returnFreeQuantity: integer("return_free_quantity").notNull().default(0),
    returnAmount: decimal("return_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    adjustmentDiscount: decimal("adjustment_discount", { precision: 10, scale: 2 }).notNull().default("0"),
    ...timestamps
}, (table) => ({
    orderIdx: index("idx_order_item_returns_order").on(table.orderId),
    itemIdx: index("idx_order_item_returns_item").on(table.orderItemId),
}));

// Order item returns relations
export const orderItemReturnsRelations = relations(orderItemReturns, ({ one }) => ({
    order: one(wholesaleOrders, {
        fields: [orderItemReturns.orderId],
        references: [wholesaleOrders.id],
    }),
    orderItem: one(wholesaleOrderItems, {
        fields: [orderItemReturns.orderItemId],
        references: [wholesaleOrderItems.id],
    }),
}));

// Extended wholesale orders relations for expenses and returns
export const wholesaleOrdersExpenseRelation = relations(wholesaleOrders, ({ many }) => ({
    expenses: many(orderExpenses),
    itemReturns: many(orderItemReturns),
    customerDues: many(orderCustomerDues),
}));

// ==================== ORDER CUSTOMER DUES ====================

export const orderCustomerDues = pgTable("order_customer_dues", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
        .notNull()
        .references(() => wholesaleOrders.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
        .references(() => customer.id, { onDelete: "set null" }),
    customerName: varchar("customer_name", { length: 150 }).notNull(),  // Keep for display/fallback
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    collectedAmount: decimal("collected_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    ...timestamps
}, (table) => ({
    orderIdx: index("idx_order_customer_dues_order").on(table.orderId),
    customerIdx: index("idx_order_customer_dues_customer").on(table.customerId),
}));

// Order customer dues relations
export const orderCustomerDuesRelations = relations(orderCustomerDues, ({ one }) => ({
    order: one(wholesaleOrders, {
        fields: [orderCustomerDues.orderId],
        references: [wholesaleOrders.id],
    }),
    customer: one(customer, {
        fields: [orderCustomerDues.customerId],
        references: [customer.id],
    }),
}));

// ==================== ORDER DAMAGE ITEMS ====================

export const orderDamageItems = pgTable("order_damage_items", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
        .notNull()
        .references(() => wholesaleOrders.id, { onDelete: "cascade" }),
    orderItemId: integer("order_item_id")
        .references(() => wholesaleOrderItems.id, { onDelete: "set null" }), // Optional - only set if from order item
    productId: integer("product_id")
        .references(() => product.id, { onDelete: "set null" }), // Product ID for any product
    productName: varchar("product_name", { length: 200 }).notNull(),
    brandName: varchar("brand_name", { length: 100 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason"),
    ...timestamps
}, (table) => ({
    orderIdx: index("idx_order_damage_items_order").on(table.orderId),
    itemIdx: index("idx_order_damage_items_item").on(table.orderItemId),
    productIdx: index("idx_order_damage_items_product").on(table.productId),
}));

// Order damage items relations
export const orderDamageItemsRelations = relations(orderDamageItems, ({ one }) => ({
    order: one(wholesaleOrders, {
        fields: [orderDamageItems.orderId],
        references: [wholesaleOrders.id],
    }),
    orderItem: one(wholesaleOrderItems, {
        fields: [orderDamageItems.orderItemId],
        references: [wholesaleOrderItems.id],
    }),
}));


export const damageReturns = pgTable("damage_returns", {
    id: serial("id").primaryKey(),
    returnNumber: varchar("return_number", { length: 50 }).notNull().unique(),
    dsrId: integer("dsr_id")
        .notNull()
        .references(() => dsr.id, { onDelete: "restrict" }),
    returnDate: date("return_date").notNull(),
    returnType: varchar("return_type", { length: 30 }).notNull(), // customer_return, damage, expired, defective
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    approvedById: integer("approved_by_id"),
    approvedAt: date("approved_at"),
    ...timestamps
}, (table) => ({
    dsrIdx: index("idx_damage_returns_dsr").on(table.dsrId),
    dateIdx: index("idx_damage_returns_date").on(table.returnDate),
    statusIdx: index("idx_damage_returns_status").on(table.status),
    returnNumberIdx: index("idx_damage_returns_number").on(table.returnNumber),
}));

export const damageReturnItems = pgTable("damage_return_items", {
    id: serial("id").primaryKey(),
    returnId: integer("return_id")
        .notNull()
        .references(() => damageReturns.id, { onDelete: "cascade" }),
    variantId: integer("variant_id")
        .notNull()
        .references(() => productVariant.id, { onDelete: "restrict" }),
    batchId: integer("batch_id")
        .references(() => stockBatch.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull(),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    condition: varchar("condition", { length: 20 }).notNull().default("damaged"), // resellable, damaged
    reason: text("reason"),
    ...timestamps
}, (table) => ({
    returnIdx: index("idx_damage_return_items_return").on(table.returnId),
    variantIdx: index("idx_damage_return_items_variant").on(table.variantId),
}));

// Damage returns relations
export const damageReturnsRelations = relations(damageReturns, ({ one, many }) => ({
    dsr: one(dsr, {
        fields: [damageReturns.dsrId],
        references: [dsr.id],
    }),
    items: many(damageReturnItems),
}));

export const damageReturnItemsRelations = relations(damageReturnItems, ({ one }) => ({
    return: one(damageReturns, {
        fields: [damageReturnItems.returnId],
        references: [damageReturns.id],
    }),
    variant: one(productVariant, {
        fields: [damageReturnItems.variantId],
        references: [productVariant.id],
    }),
    batch: one(stockBatch, {
        fields: [damageReturnItems.batchId],
        references: [stockBatch.id],
    }),
}));

// ==================== DUE COLLECTIONS ====================

export const dueCollections = pgTable("due_collections", {
    id: serial("id").primaryKey(),
    customerDueId: integer("customer_due_id")
        .references(() => orderCustomerDues.id, { onDelete: "set null" }),
    customerId: integer("customer_id")
        .references(() => customer.id, { onDelete: "set null" }),
    orderId: integer("order_id")
        .references(() => wholesaleOrders.id, { onDelete: "set null" }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    collectionDate: date("collection_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }),
    collectedByDsrId: integer("collected_by_dsr_id")
        .references(() => dsr.id, { onDelete: "set null" }),
    note: text("note"),
    ...timestamps
}, (table) => ({
    customerDueIdx: index("idx_due_collections_customer_due").on(table.customerDueId),
    customerIdx: index("idx_due_collections_customer").on(table.customerId),
    orderIdx: index("idx_due_collections_order").on(table.orderId),
    dateIdx: index("idx_due_collections_date").on(table.collectionDate),
    dsrIdx: index("idx_due_collections_dsr").on(table.collectedByDsrId),
}));

// Due collections relations
export const dueCollectionsRelations = relations(dueCollections, ({ one }) => ({
    customerDue: one(orderCustomerDues, {
        fields: [dueCollections.customerDueId],
        references: [orderCustomerDues.id],
    }),
    customer: one(customer, {
        fields: [dueCollections.customerId],
        references: [customer.id],
    }),
    order: one(wholesaleOrders, {
        fields: [dueCollections.orderId],
        references: [wholesaleOrders.id],
    }),
    collectedByDsr: one(dsr, {
        fields: [dueCollections.collectedByDsrId],
        references: [dsr.id],
    }),
}));