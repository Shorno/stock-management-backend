import { Hono } from 'hono'
import { cors } from "hono/cors"
import { auth } from "./lib/auth";
import productRoutes from "./modules/products/routes";
import categoryRoutes from "./modules/category/routes";
import brandRoutes from "./modules/brand/routes";
import dsrRoutes from "./modules/dsr/routes";
import routeRoutes from "./modules/route/routes";
import wholesaleRoutes from "./modules/wholesale/routes";
import { productBatchRoutes, stockBatchRoutes } from "./modules/stock-batch";
import { analyticsRoutes } from "./modules/analytics";
import { dsrTargetRoutes } from "./modules/dsr-target";
import { auditLogRoutes } from "./modules/audit-log";

const app = new Hono<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null
    }
}>().basePath("/api")

app.use(
    "*",
    cors({
        origin: [process.env.CLIENT_URL!],
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
        credentials: true,
    }),
);

// // Logging middleware - logs all incoming requests
// app.use("*", async (c, next) => {
//     const start = Date.now();
//     const method = c.req.method;
//     const path = c.req.path;
//     const url = c.req.url;
//
//     console.log(`[${new Date().toISOString()}] --> ${method} ${path}`);
//     console.log(`Full URL: ${url}`);
//
//     await next();
//
//     const duration = Date.now() - start;
//     console.log(`[${new Date().toISOString()}] <-- ${method} ${path} ${c.res.status} (${duration}ms)`);
// });

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
    console.log(c.get("user"))
    return c.text('Hello Hono!')
})

app.on(["POST", "GET"], "/auth/*", (ctx) => {
    return auth.handler(ctx.req.raw);
});

app.route("/products", productRoutes);
app.route("/products/:productId/batches", productBatchRoutes);
app.route("/stock-batches", stockBatchRoutes);
app.route("/categories", categoryRoutes);
app.route("/brands", brandRoutes);
app.route("/dsrs", dsrRoutes);
app.route("/routes", routeRoutes);
app.route("/wholesale-orders", wholesaleRoutes);
app.route("/analytics", analyticsRoutes);
app.route("/dsr-targets", dsrTargetRoutes);
app.route("/audit-logs", auditLogRoutes);

const port = Number(process.env.PORT) || 3000;

export default {
    port,
    fetch: app.fetch,
}
