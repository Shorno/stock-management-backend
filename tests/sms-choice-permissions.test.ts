import { expect, test } from "bun:test";
import { Hono } from "hono";
import { smsChoiceFor } from "../src/modules/sms/service";
import { dueCollectionRoutes } from "../src/modules/due-collection";

test.each([
    ["admin", true, true],
    ["admin", false, false],
    ["super_admin", false, false],
    ["super_admin", true, true],
    ["admin", undefined, undefined],
] as const)("%s's per-action SMS choice (%p) is followed", (role, choice, expected) => {
    expect(smsChoiceFor(role, choice)).toBe(expected);
});

test.each([
    ["manager", false],
    ["manager", true],
    ["dsr", false],
    [null, true],
    [undefined, false],
] as const)("a %p user's per-action SMS choice (%p) is ignored, so the SMS settings decide", (role, choice) => {
    expect(smsChoiceFor(role, choice)).toBeUndefined();
});

/** The due-collection routes behind a fake session; every case is rejected before any database access. */
function appAs(role: string | null) {
    const app = new Hono();
    app.use("*", async (c, next) => {
        c.set("user" as never, (role ? { id: "u1", name: "U", role } : null) as never);
        await next();
    });
    app.route("/due-collection", dueCollectionRoutes);
    return app;
}

const post = (app: Hono, path: string) =>
    app.request(`/due-collection${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

test.each(["/customers", "/customer-due-summary", "/history"])("GET %s needs a signed-in user", async (path) => {
    expect((await appAs(null).request(`/due-collection${path}`)).status).toBe(401);
});

test.each(["/collect", "/dsr/collect", "/sr/collect"])("POST %s needs a signed-in user", async (path) => {
    expect((await post(appAs(null), path)).status).toBe(401);
});

test.each(["/collect", "/dsr/collect", "/sr/collect"])("POST %s is refused for DSR users", async (path) => {
    expect((await post(appAs("dsr"), path)).status).toBe(403);
});

test.each(["admin", "super_admin", "manager"])("%s gets past the role check on POST /collect", async (role) => {
    // An empty body fails validation (400), which shows the request got past auth and role checks.
    expect((await post(appAs(role), "/collect")).status).toBe(400);
});
