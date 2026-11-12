import { APIError, createAuthMiddleware } from "better-auth/api";
import { findEmailByVerifiedPhone } from "../modules/account/service";

export const INVALID_PHONE_OR_PASSWORD = "Invalid phone number or password";

/**
 * Lets the normal email sign-in accept a verified mobile number in the `email` field.
 * Returns the body with the account's email swapped in, or null when the value is
 * already an email. An unknown or unverified number fails like a wrong password,
 * so it does not reveal which numbers are registered.
 */
export async function mapPhoneSignIn(
    body: unknown,
    lookup: (phone: string) => Promise<string | null> = (phone) => findEmailByVerifiedPhone(phone),
): Promise<Record<string, unknown> | null> {
    if (!body || typeof body !== "object") return null;
    const value = (body as { email?: unknown }).email;
    if (typeof value !== "string" || value.includes("@")) return null;

    const email = await lookup(value.trim());
    if (!email) throw new APIError("UNAUTHORIZED", { message: INVALID_PHONE_OR_PASSWORD });
    return { ...(body as Record<string, unknown>), email };
}

/**
 * Better Auth "before" hook. Runs ahead of body validation, so everything else
 * about email sign-in (rate limits, ban check, session cookies) stays the same.
 */
export const phoneSignInHook = createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-in/email") return;
    const body = await mapPhoneSignIn(ctx.body);
    if (body) return { context: { body } };
});
