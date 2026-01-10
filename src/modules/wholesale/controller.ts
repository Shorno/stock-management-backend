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
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";

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

export const handleCreateOrder = async (c: AppContext): Promise<Response> => {
    try {
        const validatedData = c.req.valid("json") as CreateOrderInput;
        const newOrder = await wholesaleService.createOrder(validatedData);

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "CREATE",
            entityType: "wholesale_order",
            entityId: newOrder.id,
            entityName: newOrder.orderNumber,
            newValue: newOrder,
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
        console.error("Error creating wholesale order:", error);
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
        console.error("Error fetching wholesale orders:", error);
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
        console.error("Error fetching wholesale order:", error);
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
            oldValue: oldOrder,
            newValue: updatedOrder,
        });

        return c.json<WholesaleOrderResponse>({
            success: true,
            data: updatedOrder,
            message: "Wholesale order updated successfully",
        });
    } catch (error) {
        console.error("Error updating wholesale order:", error);
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

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "DELETE",
            entityType: "wholesale_order",
            entityId: id,
            entityName: order?.orderNumber,
            oldValue: order,
        });

        return c.json<WholesaleOrderResponse>({
            success: true,
            message: "Wholesale order deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting wholesale order:", error);
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
        console.error("Error updating order status:", error);
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
        console.error("Error generating invoice PDF:", error);
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
        console.error("Error fetching due orders:", error);
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
        console.error("Error fetching payment history:", error);
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
        console.error("Error fetching DSR total due:", error);
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
        console.error("Error fetching order adjustment:", error);
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

        // Audit log
        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "UPDATE",
            entityType: "wholesale_order",
            entityId: id,
            entityName: result.order?.orderNumber,
            newValue: {
                payments: result.payments,
                expenses: result.expenses,
                itemReturns: result.itemReturns,
            },
        });

        return c.json({
            success: true,
            data: result,
            message: "Order adjustment saved successfully",
        });
    } catch (error) {
        console.error("Error saving order adjustment:", error);
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
        console.error("Error generating sales invoice PDF:", error);
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
        console.error("Error generating main invoice PDF:", error);
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
        console.error("Error fetching overdue pending orders:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch overdue pending orders",
            },
            500
        );
    }
};
