import type { Context } from "hono";
import type { CreateOrderInput, UpdateOrderInput, GetOrdersQuery } from "./validation";
import type { WholesaleOrderResponse } from "./types";
import * as wholesaleService from "./service";
import { generateInvoicePdf } from "./pdf.service";
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
                "Content-Disposition": `attachment; filename="Invoice-${order.orderNumber}.pdf"`,
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
