import {Hono} from 'hono'
import {auth} from "./lib/auth";
import {cors} from "hono/cors"

const app = new Hono<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null
    }
}>().basePath("/api")

app.use(
    "*",
    cors({
        origin: "http://localhost:5173",
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["POST", "GET", "OPTIONS"],
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
    console.log(c.get("user"))
    return c.text('Hello Hono!')
})

app.on(["POST", "GET"], "/auth/**", (ctx) => {
    return auth.handler(ctx.req.raw);
});


export default {
    port: 3000,
    fetch: app.fetch,
}
