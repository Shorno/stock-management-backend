import { Hono } from "hono";
import * as controller from "./controller";

const analyticsRoutes = new Hono();

// GET /api/analytics/overview - Sales overview with totals
analyticsRoutes.get("/overview", controller.handleGetSalesOverview);

// GET /api/analytics/sales-by-period - Time-series sales data
analyticsRoutes.get("/sales-by-period", controller.handleGetSalesByPeriod);

// GET /api/analytics/sales-by-dsr - Sales grouped by DSR
analyticsRoutes.get("/sales-by-dsr", controller.handleGetSalesByDSR);

// GET /api/analytics/sales-by-route - Sales grouped by route
analyticsRoutes.get("/sales-by-route", controller.handleGetSalesByRoute);

// GET /api/analytics/top-products - Top selling products
analyticsRoutes.get("/top-products", controller.handleGetTopProducts);

// GET /api/analytics/order-status - Order status breakdown
analyticsRoutes.get("/order-status", controller.handleGetOrderStatusBreakdown);

export default analyticsRoutes;
