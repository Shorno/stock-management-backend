import type { Context } from "hono";
import type {
    CreateOrderInput,
    UpdateOrderInput,
    GetOrdersQuery,
    SaveAdjustmentInput
} from "./validation";
import type { WholesaleOrderResponse } from "./types";
import * as wholesaleService from "./service";
import { generateInvoicePdf, generateSalesInvoicePdf, generateMainInvoicePdf } from "./pdf.service";
import type { AdjustmentData } from "./pdf.service";
import { auditLog, getUserInfoFromContext, type FinancialImpact } from "../../lib/audit-logger";
import { logError } from "../../lib/error-handler";

type AppContext = Context<
    {
        Variables: {
            user: { id: string; email: string } | null;
            session: any | null;
        };
    },
    any,
    {
        in: {
            json?: CreateOrderInput | UpdateOrderInput;
            query?: GetOrdersQuery;
        };
        out: {
            json?: CreateOrderInput | UpdateOrderInput;
            query?: GetOrdersQuery;
        };
    }
>;

// Helper to build a human-readable order object for audit logs
function buildOrderAuditValue(order: any) {
    // Build item details for the audit log
    const items = (order.items || []).map((item: any, index: number) => ({
        sl: index + 1,
        product: item.product?.name || `Product #${item.productId}`,
        brand: item.brand?.name || `Brand #${item.brandId}`,
        quantity: item.quantity,
        unit: item.unit,
        extraPieces: item.extraPieces || 0,
        freeQuantity: item.freeQuantity || 0,
        totalQuantity: item.totalQuantity || item.quantity,
        salePrice: `৳${parseFloat(item.salePrice || 0).toLocaleString()}`,
        discount: parseFloat(item.discount || 0),
        net: `৳${parseFloat(item.net || 0).toLocaleString()}`,
    }));

    return {
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        dsr: order.dsr?.name || `ID: ${order.dsrId}`,
        route: order.route?.name || `ID: ${order.routeId}`,
        category: order.category?.name || (order.categoryId ? `ID: ${order.categoryId}` : '—'),
        brand: order.brand?.name || (order.brandId ? `ID: ${order.brandId}` : '—'),
        subtotal: `৳${parseFloat(order.subtotal || 0).toLocaleString()}`,
        discount: `৳${parseFloat(order.discount || 0).toLocaleString()}`,
        total: `৳${parseFloat(order.total || 0).toLocaleString()}`,
        paidAmount: `৳${parseFloat(order.paidAmount || 0).toLocaleString()}`,
        status: order.status,
        paymentStatus: order.paymentStatus,
        itemCount: order.items?.length || 0,
        items,
    };
}

export const handleCreateOrder = async (c: AppContext): Promise<Response> => {
    try {
        const validatedData = c.req.valid("json") as CreateOrderInput;
        const newOrder = await wholesaleService.createOrder(validatedData);

        // Audit log with financial impact
        const userInfo = getUserInfoFromContext(c);
        const orderTotal = parseFloat((newOrder as any).total || 0);
        const financialImpact: FinancialImpact = {
            amount: orderTotal,
            description: `Wholesale order ${newOrder.orderNumber} created with ${validatedData.items.length} item(s)`,
            affectedMetrics: [
                { metric: "netSales", label: "Net Sales", direction: "increase", amount: orderTotal },
            ],
        };
        await auditLog({
            context: c,
            ...userInfo,
            action: "CREATE",
            entityType: "wholesale_order",
            entityId: newOrder.id,
            entityName: newOrder.orderNumber,
            newValue: buildOrderAuditValue(newOrder),
            metadata: { financialImpact, itemCount: validatedData.items.length },
        });

        return c.json<WholesaleOrderResponse>(
            {
                success: true,
                data: newOrder,
                message: "Wholesale order created successfully",
            },
            201
        );
    } catch (error) {
        logError("Error creating wholesale order:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to create wholesale order",
            },
            500
        );
    }
};

export const handleGetOrders = async (c: AppContext): Promise<Response> => {
    try {
        const validatedQuery = c.req.valid("query") as GetOrdersQuery;
        const { orders, total } = await wholesaleService.getOrders(validatedQuery);

        return c.json<WholesaleOrderResponse>({
            success: true,
            data: orders,
            total,
        });
    } catch (error) {
        logError("Error fetching wholesale orders:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: "Failed to fetch wholesale orders",
            },
            500
        );
    }
};

export const handleGetOrderById = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const order = await wholesaleService.getOrderById(id);

        if (!order) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        return c.json<WholesaleOrderResponse>({
            success: true,
            data: order,
        });
    } catch (error) {
        logError("Error fetching wholesale order:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: "Failed to fetch wholesale order",
            },
            500
        );
    }
};

export const handleUpdateOrder = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as UpdateOrderInput;
        const oldOrder = await wholesaleService.getOrderById(id);
        const updatedOrder = await wholesaleService.updateOrder(id, validatedData);

        if (!updatedOrder) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "UPDATE",
            entityType: "wholesale_order",
            entityId: id,
            entityName: updatedOrder.orderNumber,
            oldValue: buildOrderAuditValue(oldOrder),
            newValue: buildOrderAuditValue(updatedOrder),
            metadata: { description: `Updated wholesale order ${updatedOrder.orderNumber}` },
        });

        return c.json<WholesaleOrderResponse>({
            success: true,
            data: updatedOrder,
            message: "Wholesale order updated successfully",
        });
    } catch (error) {
        logError("Error updating wholesale order:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update wholesale order",
            },
            500
        );
    }
};

export const handleDeleteOrder = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const order = await wholesaleService.getOrderById(id);
        const deleted = await wholesaleService.deleteOrder(id);

        if (!deleted) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        // Audit log with financial impact
        const userInfo = getUserInfoFromContext(c);
        const deletedTotal = parseFloat((order as any)?.total || 0);
        const financialImpact: FinancialImpact = {
            amount: deletedTotal,
            description: `Deleted wholesale order ${order?.orderNumber} (৳${deletedTotal.toLocaleString()})`,
            affectedMetrics: [
                { metric: "netSales", label: "Net Sales", direction: "decrease", amount: deletedTotal },
            ],
        };
        await auditLog({
            context: c,
            ...userInfo,
            action: "DELETE",
            entityType: "wholesale_order",
            entityId: id,
            entityName: order?.orderNumber,
            oldValue: buildOrderAuditValue(order),
            metadata: { financialImpact },
        });

        return c.json<WholesaleOrderResponse>({
            success: true,
            message: "Wholesale order deleted successfully",
        });
    } catch (error) {
        logError("Error deleting wholesale order:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to delete wholesale order",
            },
            500
        );
    }
};

export const handleUpdateStatus = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const { status } = c.req.valid("json") as { status: string };
        const oldOrder = await wholesaleService.getOrderById(id);
        const updatedOrder = await wholesaleService.updateOrderStatus(id, status);

        if (!updatedOrder) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "STATUS_CHANGE",
            entityType: "wholesale_order",
            entityId: id,
            entityName: updatedOrder.orderNumber,
            oldValue: { status: oldOrder?.status },
            newValue: { status },
        });

        return c.json<WholesaleOrderResponse>({
            success: true,
            data: updatedOrder,
            message: `Order status updated to "${status}" successfully`,
        });
    } catch (error) {
        logError("Error updating order status:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update order status",
            },
            500
        );
    }
};

export const handleGenerateInvoicePdf = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const order = await wholesaleService.getOrderById(id);

        if (!order) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        const pdfBuffer = await generateInvoicePdf(order);

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename = "Invoice-${order.orderNumber}.pdf"`,
                "Content-Length": pdfBuffer.length.toString(),
            },
        });
    } catch (error) {
        logError("Error generating invoice PDF:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to generate invoice PDF",
            },
            500
        );
    }
};



// Handle getting due orders
export const handleGetDueOrders = async (c: AppContext): Promise<Response> => {
    try {
        const validatedQuery = c.req.valid("query") as {
            dsrId?: number;
            routeId?: number;
            startDate?: string;
            endDate?: string;
            limit?: number;
            offset?: number;
        };

        const result = await wholesaleService.getDueOrders(validatedQuery);

        return c.json({
            success: true,
            data: result.orders,
            total: result.total,
            totalDue: result.totalDue,
        });
    } catch (error) {
        logError("Error fetching due orders:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch due orders",
            },
            500
        );
    }
};

// Handle getting payment history for an order
export const handleGetPaymentHistory = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const payments = await wholesaleService.getPaymentHistory(id);

        return c.json({
            success: true,
            data: payments,
        });
    } catch (error) {
        logError("Error fetching payment history:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch payment history",
            },
            500
        );
    }
};

// Handle getting total due for a specific DSR
export const handleGetDsrTotalDue = async (c: AppContext): Promise<Response> => {
    try {
        const dsrId = Number(c.req.param("dsrId"));

        if (isNaN(dsrId)) {
            return c.json(
                {
                    success: false,
                    message: "Invalid DSR ID",
                },
                400
            );
        }

        const result = await wholesaleService.getDsrTotalDue(dsrId);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        logError("Error fetching DSR total due:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch DSR total due",
            },
            500
        );
    }
};

// Handle getting order adjustment data
export const handleGetOrderAdjustment = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const adjustmentData = await wholesaleService.getOrderAdjustment(id);

        if (!adjustmentData) {
            return c.json(
                {
                    success: false,
                    message: "Order not found",
                },
                404
            );
        }

        return c.json({
            success: true,
            data: adjustmentData,
        });
    } catch (error) {
        logError("Error fetching order adjustment:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch order adjustment",
            },
            500
        );
    }
};

// Handle saving order adjustment (payments, expenses, item returns)
export const handleSaveOrderAdjustment = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as SaveAdjustmentInput;

        // Fetch old adjustment state for audit diff
        const oldAdjustment = await wholesaleService.getOrderAdjustment(id);

        const result = await wholesaleService.saveOrderAdjustment(id, validatedData);

        if (!result) {
            return c.json(
                {
                    success: false,
                    message: "Order not found",
                },
                404
            );
        }

        // Compute financial impact of the adjustment
        const userInfo = getUserInfoFromContext(c);
        const totalPayments = validatedData.payments.reduce((s, p) => s + p.amount, 0);
        const totalExpenses = validatedData.expenses.reduce((s, e) => s + e.amount, 0);
        const totalCustomerDues = validatedData.customerDues.reduce((s, d) => s + d.amount, 0);
        const totalDsrDues = validatedData.dsrDues.reduce((s, d) => s + d.amount, 0);
        const totalItemReturns = validatedData.itemReturns.reduce((s, r) => s + (r.returnAmount || 0), 0);

        const totalDamageReturns = validatedData.damageReturns.reduce((s, d) => s + (d.quantity * d.unitPrice), 0);

        const affectedMetrics: FinancialImpact["affectedMetrics"] = [];
        if (totalPayments > 0) affectedMetrics.push({ metric: "cashBalance", label: "Cash Balance", direction: "increase", amount: totalPayments });
        if (totalExpenses > 0) affectedMetrics.push({ metric: "profitLoss", label: "Profit/Loss", direction: "decrease", amount: totalExpenses });
        if (totalItemReturns > 0) affectedMetrics.push({ metric: "netSales", label: "Net Sales (Returns)", direction: "decrease", amount: totalItemReturns });
        if (totalDamageReturns > 0) affectedMetrics.push({ metric: "netSales", label: "Damage Returns", direction: "decrease", amount: totalDamageReturns });
        if (totalCustomerDues > 0) affectedMetrics.push({ metric: "dsrSalesDue", label: "Customer Dues", direction: "increase", amount: totalCustomerDues });
        if (totalDsrDues > 0) affectedMetrics.push({ metric: "dsrOwnDue", label: "DSR Own Due", direction: "increase", amount: totalDsrDues });

        const financialImpact: FinancialImpact = {
            amount: totalPayments,
            description: `Adjusted order ${result.order?.orderNumber}: ৳${totalPayments.toLocaleString()} collected`,
            affectedMetrics,
        };

        // Build structured summary for the audit log
        const adjustmentSummary = {
            payments: { count: validatedData.payments.filter(p => p.amount > 0).length, total: totalPayments },
            expenses: { count: validatedData.expenses.filter(e => e.amount > 0).length, total: totalExpenses },
            itemReturns: { count: validatedData.itemReturns.filter(r => r.returnQuantity > 0).length, total: totalItemReturns },
            customerDues: { count: validatedData.customerDues.filter(d => d.amount > 0).length, total: totalCustomerDues },
            dsrDues: { count: validatedData.dsrDues.filter(d => d.amount > 0).length, total: totalDsrDues },
            damageReturns: { count: validatedData.damageReturns.filter(d => d.quantity > 0).length, total: totalDamageReturns },
            settlement: result.summary,
        };

        await auditLog({
            context: c,
            ...userInfo,
            action: "UPDATE",
            entityType: "wholesale_order",
            entityId: id,
            entityName: result.order?.orderNumber,
            oldValue: oldAdjustment ? {
                summary: oldAdjustment.summary,
                paymentsCount: oldAdjustment.payments?.length || 0,
                expensesCount: oldAdjustment.expenses?.length || 0,
            } : null,
            newValue: adjustmentSummary,
            metadata: { financialImpact, adjustmentDetails: validatedData },
        });

        return c.json({
            success: true,
            data: result,
            message: "Order adjustment saved successfully",
        });
    } catch (error) {
        logError("Error saving order adjustment:", error);
        return c.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to save order adjustment",
            },
            500
        );
    }
};

// Handle generating Sales Invoice PDF (simple version)
export const handleGenerateSalesInvoicePdf = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const order = await wholesaleService.getOrderById(id);

        if (!order) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        // Get adjustment data for net quantities
        const adjustmentData = await wholesaleService.getOrderAdjustment(id);
        const adjustment: AdjustmentData | null = adjustmentData ? {
            payments: adjustmentData.payments || [],
            expenses: adjustmentData.expenses || [],
            itemsWithCalculations: adjustmentData.itemsWithCalculations || [],
            customerDues: adjustmentData.customerDues || [],
            summary: adjustmentData.summary,
        } : null;

        const pdfBuffer = await generateSalesInvoicePdf(order, adjustment);

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename = "SalesInvoice-${order.orderNumber}.pdf"`,
                "Content-Length": pdfBuffer.length.toString(),
            },
        });
    } catch (error) {
        logError("Error generating sales invoice PDF:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to generate sales invoice PDF",
            },
            500
        );
    }
};

// Handle generating Main Invoice PDF (detailed version)
export const handleGenerateMainInvoicePdf = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const order = await wholesaleService.getOrderById(id);

        if (!order) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        // Get adjustment data for calculations
        const adjustmentData = await wholesaleService.getOrderAdjustment(id);
        const adjustment: AdjustmentData | null = adjustmentData ? {
            payments: adjustmentData.payments || [],
            expenses: adjustmentData.expenses || [],
            itemsWithCalculations: adjustmentData.itemsWithCalculations || [],
            customerDues: adjustmentData.customerDues || [],
            damageReturns: adjustmentData.damageReturns || [],
            summary: adjustmentData.summary,
        } : null;

        const pdfBuffer = await generateMainInvoicePdf(order, adjustment);

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename = "Invoice-${order.orderNumber}.pdf"`,
                "Content-Length": pdfBuffer.length.toString(),
            },
        });
    } catch (error) {
        logError("Error generating main invoice PDF:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to generate main invoice PDF",
            },
            500
        );
    }
};

// Handle getting overdue pending orders
export const handleGetOverduePendingOrders = async (c: AppContext): Promise<Response> => {
    try {
        // Get threshold days from query param (default to 3 if not provided)
        const thresholdDays = Number(c.req.query("thresholdDays")) || 3;

        if (thresholdDays < 1 || thresholdDays > 30) {
            return c.json(
                {
                    success: false,
                    message: "Threshold days must be between 1 and 30",
                },
                400
            );
        }

        const result = await wholesaleService.getOverduePendingOrders(thresholdDays);

        return c.json({
            success: true,
            data: result.orders,
            total: result.total,
            thresholdDays: result.thresholdDays,
        });
    } catch (error) {
        logError("Error fetching overdue pending orders:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch overdue pending orders",
            },
            500
        );
    }
};
