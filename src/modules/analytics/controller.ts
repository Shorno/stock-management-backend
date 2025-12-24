import type { Context } from "hono";
import * as analyticsService from "./service";

type AppContext = Context<{
    Variables: {
        user: { id: string; email: string } | null;
        session: any | null;
    };
}>;

export const handleGetSalesOverview = async (c: AppContext): Promise<Response> => {
    try {
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");

        const result = await analyticsService.getSalesOverview({ startDate, endDate });

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Error fetching sales overview:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch sales overview",
            },
            500
        );
    }
};

export const handleGetSalesByPeriod = async (c: AppContext): Promise<Response> => {
    try {
        const period = c.req.query("period") as 'daily' | 'weekly' | 'monthly' || 'daily';
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");

        const result = await analyticsService.getSalesByPeriod(period, { startDate, endDate });

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Error fetching sales by period:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch sales by period",
            },
            500
        );
    }
};

export const handleGetSalesByDSR = async (c: AppContext): Promise<Response> => {
    try {
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");

        const result = await analyticsService.getSalesByDSR({ startDate, endDate });

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Error fetching sales by DSR:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch sales by DSR",
            },
            500
        );
    }
};

export const handleGetSalesByRoute = async (c: AppContext): Promise<Response> => {
    try {
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");

        const result = await analyticsService.getSalesByRoute({ startDate, endDate });

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Error fetching sales by route:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch sales by route",
            },
            500
        );
    }
};

export const handleGetTopProducts = async (c: AppContext): Promise<Response> => {
    try {
        const limit = parseInt(c.req.query("limit") || "10");
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");

        const result = await analyticsService.getTopProducts(limit, { startDate, endDate });

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Error fetching top products:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch top products",
            },
            500
        );
    }
};

export const handleGetOrderStatusBreakdown = async (c: AppContext): Promise<Response> => {
    try {
        const startDate = c.req.query("startDate");
        const endDate = c.req.query("endDate");

        const result = await analyticsService.getOrderStatusBreakdown({ startDate, endDate });

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Error fetching order status breakdown:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch order status breakdown",
            },
            500
        );
    }
};
