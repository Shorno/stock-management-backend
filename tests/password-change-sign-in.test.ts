import { beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword } from "better-auth/crypto";
import * as schema from "../src/db/schema";
import type { db as applicationDb } from "../src/db/config";
import { changePassword, requestPasswordOtp, requestPhoneOtp, verifyPhoneOtp, type AccountDeps } from "../src/modules/account/service";

process.env.BETTER_AUTH_SECRET ||= "test-secret-test-secret-test-secret";

const client = new PGlite();
const database = drizzle(client, { schema }) as unknown as typeof applicationDb;
let sent: string[] = [];
const deps: AccountDeps = { database, smsConfigured: () => true, send: async (_t, m) => { sent.push(m); return { ok: true, requestId: "1" }; } };
const lastCode = () => sent.at(-1)!.match(/^(\d{6})/)![1]!;
const auth = betterAuth({
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, autoSignIn: false },
    rateLimit: { enabled: false },
});

const canSignIn = (email: string, password: string) =>
    auth.api.signInEmail({ body: { email, password } }).then(() => true, () => false);

beforeAll(async () => {
    await client.exec(`
        CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean DEFAULT false NOT NULL,
            image text, role text, banned boolean, ban_reason text, ban_expires timestamp,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE account (id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
            user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade, access_token text, refresh_token text, id_token text,
            access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, password text,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp NOT NULL DEFAULT now());
        CREATE TABLE session (id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp NOT NULL DEFAULT now(),
            ip_address text, user_agent text, user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade, impersonated_by text);
        CREATE TABLE verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamp NOT NULL,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL);
        CREATE TABLE sms_logs (id serial PRIMARY KEY, customer_id integer, recipient_name varchar(150), phone varchar(20) NOT NULL,
            message text NOT NULL, type varchar(20) NOT NULL, status varchar(20) NOT NULL, segments integer DEFAULT 1 NOT NULL,
            request_id varchar(50), error text, order_id integer, due_collection_id integer, sent_by_user_id text,
            sent_by_name varchar(150), created_at timestamp DEFAULT now() NOT NULL);
    `);
    const migration = await Bun.file(new URL("../drizzle/0017_user_phone_otp.sql", import.meta.url)).text();
    for (const statement of migration.split("--> statement-breakpoint")) await client.exec(statement);
}, 20000);

async function change(userId: string, phone: string, from: string, to: string) {
    const u = { id: userId, name: userId };
    await requestPhoneOtp(u, phone, deps);
    await verifyPhoneOtp(u, lastCode(), deps);
    await client.exec("UPDATE phone_otp SET created_at = created_at - interval '2 minutes'");
    await requestPasswordOtp(u, from, deps);
    await changePassword(u, null, { currentPassword: from, newPassword: to, code: lastCode() }, deps);
}

// End-to-end: a real Better Auth sign-in against the rows the password change wrote.
test("after a password change only the new password signs in", async () => {
    const { user } = await auth.api.signUpEmail({ body: { email: "a@example.com", password: "old-password", name: "A" } });
    expect(await canSignIn("a@example.com", "old-password")).toBe(true);
    await change(user.id, "01712345678", "old-password", "new-password");
    expect(await canSignIn("a@example.com", "old-password")).toBe(false);
    expect(await canSignIn("a@example.com", "new-password")).toBe(true);
});

test("a user with duplicate credential rows cannot keep signing in with the old password", async () => {
    const { user } = await auth.api.signUpEmail({ body: { email: "b@example.com", password: "old-password", name: "B" } });
    const { rows } = await client.query<{ password: string }>("SELECT password FROM account WHERE user_id = $1", [user.id]);
    await client.query("INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ('dup', $1, 'credential', $1, $2)", [user.id, rows[0]!.password]);
    await change(user.id, "01812345678", "old-password", "new-password");
    expect(await canSignIn("b@example.com", "old-password")).toBe(false);
    expect(await canSignIn("b@example.com", "new-password")).toBe(true);
    const after = await client.query<{ n: number }>("SELECT count(DISTINCT password)::int AS n FROM account WHERE user_id = $1", [user.id]);
    expect(after.rows[0]!.n).toBe(1);
});

test("a user whose duplicate rows already hold different passwords can change it and ends up with one password", async () => {
    const { user } = await auth.api.signUpEmail({ body: { email: "c@example.com", password: "password-one", name: "C" } });
    // A second row with a different password, as left behind by the old bug.
    const other = await hashPassword("password-two");
    await client.query("INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ('dup-c', $1, 'credential', $1, $2)", [user.id, other]);

    // Whichever of the two the user signs in with is accepted as the current password.
    const current = (await canSignIn("c@example.com", "password-one")) ? "password-one" : "password-two";
    await change(user.id, "01912345678", current, "brand-new-password");

    expect(await canSignIn("c@example.com", "password-one")).toBe(false);
    expect(await canSignIn("c@example.com", "password-two")).toBe(false);
    expect(await canSignIn("c@example.com", "brand-new-password")).toBe(true);
    const after = await client.query<{ n: number }>("SELECT count(DISTINCT password)::int AS n FROM account WHERE user_id = $1", [user.id]);
    expect(after.rows[0]!.n).toBe(1);
});

test("the current-password check still rejects a password no row holds", async () => {
    const { user } = await auth.api.signUpEmail({ body: { email: "d@example.com", password: "real-password", name: "D" } });
    const u = { id: user.id, name: "D" };
    await requestPhoneOtp(u, "01612345678", deps);
    await verifyPhoneOtp(u, lastCode(), deps);
    const error = await requestPasswordOtp(u, "wrong-password", deps).then(() => null, (e) => e);
    expect((error as Error)?.message).toMatch(/Current password is incorrect/);
});
