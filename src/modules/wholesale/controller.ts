import type { Context } from "hono";
import type { CreateOrderInput, UpdateOrderInput, GetOrdersQuery, AddItemInput, UpdateItemInput } from "./validation";
import type { WholesaleOrderResponse } from "./types";
import * as wholesaleService from "./service";

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

// Add item to order
export const handleAddOrderItem = async (c: AppContext): Promise<Response> => {
    try {
        const orderId = Number(c.req.param("orderId"));

        if (isNaN(orderId)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as AddItemInput;
        const updatedOrder = await wholesaleService.addOrderItem(orderId, validatedData);

        if (!updatedOrder) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order not found",
                },
                404
            );
        }

        return c.json<WholesaleOrderResponse>(
            {
                success: true,
                data: updatedOrder,
                message: "Item added to order successfully",
            },
            201
        );
    } catch (error) {
        console.error("Error adding item to order:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to add item to order",
            },
            500
        );
    }
};

// Update item in order
export const handleUpdateOrderItem = async (c: AppContext): Promise<Response> => {
    try {
        const orderId = Number(c.req.param("orderId"));
        const itemId = Number(c.req.param("itemId"));

        if (isNaN(orderId) || isNaN(itemId)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID or item ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as UpdateItemInput;
        const updatedOrder = await wholesaleService.updateOrderItem(orderId, itemId, validatedData);

        if (!updatedOrder) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order or item not found",
                },
                404
            );
        }

        return c.json<WholesaleOrderResponse>({
            success: true,
            data: updatedOrder,
            message: "Item updated successfully",
        });
    } catch (error) {
        console.error("Error updating item:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update item",
            },
            500
        );
    }
};

// Delete item from order
export const handleDeleteOrderItem = async (c: AppContext): Promise<Response> => {
    try {
        const orderId = Number(c.req.param("orderId"));
        const itemId = Number(c.req.param("itemId"));

        if (isNaN(orderId) || isNaN(itemId)) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Invalid order ID or item ID",
                },
                400
            );
        }

        const updatedOrder = await wholesaleService.deleteOrderItem(orderId, itemId);

        if (!updatedOrder) {
            return c.json<WholesaleOrderResponse>(
                {
                    success: false,
                    message: "Wholesale order or item not found",
                },
                404
            );
        }

        return c.json<WholesaleOrderResponse>({
            success: true,
            data: updatedOrder,
            message: "Item deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting item:", error);
        return c.json<WholesaleOrderResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to delete item",
            },
            500
        );
    }
};

