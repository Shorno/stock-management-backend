import { expect, test } from "bun:test";
import { APIError } from "better-auth/api";
import { auth } from "../src/lib/auth";
import { INVALID_PHONE_OR_PASSWORD, mapPhoneSignIn } from "../src/lib/phone-sign-in";

const lookup = async (phone: string) => (phone === "01712345678" ? "alice@example.com" : null);

test("an email passes through untouched", async () => {
    expect(await mapPhoneSignIn({ email: "alice@example.com", password: "x" }, lookup)).toBeNull();
    expect(await mapPhoneSignIn(undefined, lookup)).toBeNull();
});

test("a verified number is swapped for the account's email, keeping the rest of the body", async () => {
    expect(await mapPhoneSignIn({ email: " 01712345678 ", password: "secret", rememberMe: false }, lookup))
        .toEqual({ email: "alice@example.com", password: "secret", rememberMe: false });
});

test("an unknown number fails like a wrong password", async () => {
    const error = await mapPhoneSignIn({ email: "01999999999", password: "x" }, lookup).catch((e) => e);
    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe("UNAUTHORIZED");
    expect(error.message).toBe(INVALID_PHONE_OR_PASSWORD);
});

// "not-a-phone" is rejected before any database lookup, so this needs no database.
test("Better Auth's email sign-in route runs the phone hook", async () => {
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: process.env.CLIENT_URL || "https://mstamimenterprise.shop" },
        body: JSON.stringify({ email: "not-a-phone", password: "whatever-123" }),
    }));
    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe(INVALID_PHONE_OR_PASSWORD);
});
