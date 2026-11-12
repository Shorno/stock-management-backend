import { expect, test } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "../src/lib/rate-limit";
import { auth } from "../src/lib/auth";

test("rate limiter blocks an IP after the limit and keeps IPs separate", async () => {
    const app = new Hono();
    app.post("/x", rateLimit({ prefix: "t", windowMs: 60_000, max: 2 }), (c) => c.json({ ok: true }));
    const call = (ip: string) => app.request("/x", { method: "POST", headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

    expect((await call("1.1.1.1")).status).toBe(200);
    expect((await call("1.1.1.1")).status).toBe(200);
    const blocked = await call("1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await call("2.2.2.2")).status).toBe(200);
});

// These are rejected before any database access, so no database is needed.
test.each(["/change-password", "/request-password-reset", "/reset-password"])(
    "Better Auth's built-in %s route is disabled",
    async (path) => {
        const response = await auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:5173" },
            body: JSON.stringify({}),
        }));
        expect(response.status).toBe(404);
    },
);
