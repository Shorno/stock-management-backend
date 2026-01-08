import 'dotenv/config';
import { Hono } from 'hono'
import { cors } from "hono/cors"
import { auth } from "./lib/auth";
import productRoutes from "./modules/products/routes";
import categoryRoutes from "./modules/category/routes";
import brandRoutes from "./modules/brand/routes";
import dsrRoutes from "./modules/dsr/routes";
import routeRoutes from "./modules/route/routes";
import wholesaleRoutes from "./modules/wholesale/routes";
import { variantBatchRoutes, stockBatchRoutes } from "./modules/stock-batch";
import { analyticsRoutes } from "./modules/analytics";
import { dsrTargetRoutes } from "./modules/dsr-target";
import { auditLogRoutes } from "./modules/audit-log";
import { variantRoutes, variantStandaloneRoutes } from "./modules/variant";
import reportsRoutes from "./modules/reports/routes";
import { customerRoutes } from "./modules/customer";
import damageReturnsRoutes from "./modules/damage-returns/routes";
import { unitRoutes } from "./modules/unit";
import { supplierRoutes } from "./modules/supplier";

const app = new Hono<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null
    }
}>().basePath("/api")

const CLIENT_ORIGIN = process.env.CLIENT_URL || "https://mstamimenterprise.shop";
console.log("CORS Origin configured:", CLIENT_ORIGIN);

app.use(
    "*",
    cors({
        origin: CLIENT_ORIGIN,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
        credentials: true,
    }),
);

app.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
        c.set("user", null);
        c.set("session", null);
        await next();
        return;
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
});

app.get('/', (c) => {
    return c.text('Hello Hono!')
})

// Explicit CORS for auth routes - must be before the auth handler
app.use(
    "/auth/*",
    cors({
        origin: CLIENT_ORIGIN,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["POST", "GET", "OPTIONS"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
        credentials: true,
    }),
);

app.on(["POST", "GET", "OPTIONS"], "/auth/*", (ctx) => {
    return auth.handler(ctx.req.raw);
});

app.route("/products", productRoutes);
app.route("/products/:productId/variants", variantRoutes);
app.route("/variants", variantStandaloneRoutes);
app.route("/variants/:variantId/batches", variantBatchRoutes);
app.route("/stock-batches", stockBatchRoutes);
app.route("/categories", categoryRoutes);
app.route("/brands", brandRoutes);
app.route("/dsrs", dsrRoutes);
app.route("/routes", routeRoutes);
app.route("/wholesale-orders", wholesaleRoutes);
app.route("/analytics", analyticsRoutes);
app.route("/dsr-targets", dsrTargetRoutes);
app.route("/audit-logs", auditLogRoutes);
app.route("/reports", reportsRoutes);
app.route("/customers", customerRoutes);
app.route("/damage-returns", damageReturnsRoutes);
app.route("/units", unitRoutes);
app.route("/suppliers", supplierRoutes);


const port = Number(process.env.PORT) || 3000;

export default {
    port,
    fetch: app.fetch,
}
