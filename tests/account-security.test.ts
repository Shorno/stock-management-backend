import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import * as schema from "../src/db/schema";
import type { db as applicationDb } from "../src/db/config";
import {
    AccountError,
    changePassword,
    getSecurityStatus,
    requestPasswordOtp,
    requestPasswordReset,
    requestPhoneOtp,
    resetPasswordThrottle,
    resetPasswordWithOtp,
    verifyPhoneOtp,
    type AccountDeps,
} from "../src/modules/account/service";
import { maskPhone } from "../src/modules/account/otp";

process.env.BETTER_AUTH_SECRET ||= "test-secret";

// Every service call gets this in-memory database and a fake SMS sender.
// Nothing here touches the configured database or the real SMS gateway.
const client = new PGlite();
const database = drizzle(client, { schema }) as unknown as typeof applicationDb;
let sent: { to: string; message: string }[] = [];
let sendOk = true;
const deps: AccountDeps = {
    database,
    smsConfigured: () => true,
    send: async (to, message) => {
        sent.push({ to, message });
        return sendOk ? { ok: true, requestId: "1" } : { ok: false, error: "Insufficient SMS balance" };
    },
};
const alice = { id: "alice", name: "Alice" };
const bob = { id: "bob", name: "Bob" };
const lastCode = () => sent.at(-1)!.message.match(/^(\d{6})/)![1]!;

async function expectError(promise: Promise<unknown>, status: number, text: RegExp) {
    const error = await promise.then(() => null, (e) => e);
    expect(error).toBeInstanceOf(AccountError);
    expect((error as AccountError).status).toBe(status);
    expect((error as AccountError).message).toMatch(text);
}

/** Lets the next code be requested without waiting out the resend cooldown. */
const skipCooldown = () => client.exec("UPDATE phone_otp SET created_at = created_at - interval '2 minutes'");

beforeAll(async () => {
    await client.exec(`
        CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, banned boolean);
        CREATE TABLE account (id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
            user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade, access_token text, refresh_token text, id_token text,
            access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, password text,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp NOT NULL DEFAULT now());
        CREATE TABLE session (id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE,
            created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp NOT NULL DEFAULT now(),
            ip_address text, user_agent text, user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade, impersonated_by text);
        CREATE TABLE sms_logs (id serial PRIMARY KEY, customer_id integer, recipient_name varchar(150), phone varchar(20) NOT NULL,
            message text NOT NULL, type varchar(20) NOT NULL, status varchar(20) NOT NULL, segments integer DEFAULT 1 NOT NULL,
            request_id varchar(50), error text, order_id integer, due_collection_id integer, sent_by_user_id text,
            sent_by_name varchar(150), created_at timestamp DEFAULT now() NOT NULL);
    `);
    const migration = await Bun.file(new URL("../drizzle/0017_user_phone_otp.sql", import.meta.url)).text();
    for (const statement of migration.split("--> statement-breakpoint")) await client.exec(statement);
}, 20000);

beforeEach(async () => {
    sent = [];
    sendOk = true;
    resetPasswordThrottle();
    const hash = await hashPassword("old-password");
    await client.exec(`TRUNCATE "user", account, session, sms_logs, phone_otp, user_phone RESTART IDENTITY CASCADE;`);
    await client.query(`INSERT INTO "user" (id, name, email) VALUES ('alice', 'Alice', 'alice@example.com'), ('bob', 'Bob', 'bob@example.com')`);
    await client.query(`INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES
        ('a1', 'alice', 'credential', 'alice', $1), ('b1', 'bob', 'credential', 'bob', $1)`, [hash]);
    await client.query(`INSERT INTO session (id, expires_at, token, user_id) VALUES
        ('s-current', now() + interval '1 day', 't1', 'alice'),
        ('s-other', now() + interval '1 day', 't2', 'alice'),
        ('s-bob', now() + interval '1 day', 't3', 'bob')`);
});

afterAll(async () => { await client.close(); });

async function verifyAlicePhone(phone = "01712345678") {
    await requestPhoneOtp(alice, phone, deps);
    await verifyPhoneOtp(alice, lastCode(), deps);
}

test("password change is blocked until a phone number is verified", async () => {
    expect((await getSecurityStatus("alice", deps)).canChangePassword).toBe(false);
    await expectError(requestPasswordOtp(alice, "old-password", deps), 403, /verify a mobile number/i);
    await expectError(changePassword(alice, "s-current",
        { currentPassword: "old-password", newPassword: "new-password-1", code: "123456" }, deps), 403, /verify a mobile number/i);
    expect(sent).toHaveLength(0);
});

test("a phone is saved only after the texted code is entered", async () => {
    const result = await requestPhoneOtp(alice, "017-1234-5678", deps);
    expect(result.maskedPhone).toBe(maskPhone("8801712345678"));
    expect(sent[0]!.to).toBe("8801712345678");
    expect((await getSecurityStatus("alice", deps)).phone).toBeNull();

    await verifyPhoneOtp(alice, lastCode(), deps);
    const status = await getSecurityStatus("alice", deps);
    expect(status.phone).toBe("8801712345678");
    expect(status.canChangePassword).toBe(true);

    // The code is spent and the log never holds it.
    await expectError(verifyPhoneOtp(alice, lastCode(), deps), 400, /expired or was not requested/);
    const { rows } = await client.query<{ message: string; type: string }>("SELECT message, type FROM sms_logs");
    expect(rows[0]!.type).toBe("otp");
    expect(rows[0]!.message).not.toContain(lastCode());
});

test("rejects invalid numbers and numbers owned by another user", async () => {
    await expectError(requestPhoneOtp(alice, "12345", deps), 400, /valid Bangladeshi mobile/);
    await verifyAlicePhone();
    await expectError(requestPhoneOtp(bob, "+8801712345678", deps), 409, /another account/);
    await skipCooldown();
    await expectError(requestPhoneOtp(alice, "01712345678", deps), 400, /already verified on your account/);
});

test("wrong codes use up attempts and then kill the code", async () => {
    await requestPhoneOtp(alice, "01712345678", deps);
    const good = lastCode();
    const wrong = good === "000000" ? "111111" : "000000";
    for (let left = 4; left >= 1; left--) {
        await expectError(verifyPhoneOtp(alice, wrong, deps), 400, new RegExp(`${left} attempts? left`));
    }
    await expectError(verifyPhoneOtp(alice, wrong, deps), 400, /Too many failed attempts/);
    await expectError(verifyPhoneOtp(alice, good, deps), 400, /expired or was not requested/);
});

test("expired codes are refused", async () => {
    await requestPhoneOtp(alice, "01712345678", deps);
    await client.exec("UPDATE phone_otp SET expires_at = now() - interval '1 second'");
    await expectError(verifyPhoneOtp(alice, lastCode(), deps), 400, /expired/);
});

test("resend cooldown, hourly cap, and a new code replaces the old one", async () => {
    await requestPhoneOtp(alice, "01712345678", deps);
    const first = lastCode();
    await expectError(requestPhoneOtp(alice, "01712345678", deps), 429, /wait \d+ seconds/);

    await skipCooldown();
    await requestPhoneOtp(alice, "01812345678", deps);
    if (first !== lastCode()) await expectError(verifyPhoneOtp(alice, first, deps), 400, /Incorrect code/);

    for (let i = 0; i < 3; i++) {
        await skipCooldown();
        await requestPhoneOtp(alice, "01712345678", deps);
    }
    await skipCooldown();
    await client.exec("UPDATE phone_otp SET created_at = now() - interval '5 minutes'");
    await expectError(requestPhoneOtp(alice, "01712345678", deps), 429, /Try again in an hour/);
});

test("a failed SMS does not leave a usable code", async () => {
    sendOk = false;
    await expectError(requestPhoneOtp(alice, "01712345678", deps), 502, /Insufficient SMS balance/);
    await expectError(verifyPhoneOtp(alice, lastCode(), deps), 400, /expired or was not requested/);
});

test("no SMS gateway means a clear error, not a silent skip", async () => {
    await expectError(requestPhoneOtp(alice, "01712345678", { ...deps, smsConfigured: () => false }), 503, /not configured/);
});

test("password change needs the current password and the code sent to the verified phone", async () => {
    await verifyAlicePhone();
    await skipCooldown();

    await expectError(requestPasswordOtp(alice, "wrong-password", deps), 400, /Current password is incorrect/);
    expect(sent).toHaveLength(1);

    await requestPasswordOtp(alice, "old-password", deps);
    expect(sent.at(-1)!.to).toBe("8801712345678");
    expect(sent.at(-1)!.message).toMatch(/password change code/);
    const code = lastCode();

    await expectError(changePassword(alice, "s-current",
        { currentPassword: "old-password", newPassword: "old-password", code }, deps), 400, /must be different/);
    await expectError(changePassword(alice, "s-current",
        { currentPassword: "nope-nope", newPassword: "new-password-1", code }, deps), 400, /Current password is incorrect\. 4 attempts left/);

    const result = await changePassword(alice, "s-current",
        { currentPassword: "old-password", newPassword: "new-password-1", code }, deps);
    expect(result.otherSessionsSignedOut).toBe(1);

    const { rows: [acc] } = await client.query<{ password: string }>("SELECT password FROM account WHERE id = 'a1'");
    expect(await verifyPassword({ hash: acc!.password, password: "new-password-1" })).toBe(true);
    const { rows: sessions } = await client.query<{ id: string }>("SELECT id FROM session ORDER BY id");
    expect(sessions.map((s) => s.id)).toEqual(["s-bob", "s-current"]);

    // The code cannot be replayed.
    await expectError(changePassword(alice, "s-current",
        { currentPassword: "new-password-1", newPassword: "new-password-2", code }, deps), 400, /expired or was not requested/);
});

test("a verify-phone code cannot be used to change the password", async () => {
    await verifyAlicePhone();
    await skipCooldown();
    await requestPhoneOtp(alice, "01812345678", deps);
    await expectError(changePassword(alice, "s-current",
        { currentPassword: "old-password", newPassword: "new-password-1", code: lastCode() }, deps), 400, /expired or was not requested/);
});

test("changing the phone number cancels a pending password code", async () => {
    await verifyAlicePhone();
    await skipCooldown();
    await requestPasswordOtp(alice, "old-password", deps);
    const passwordCode = lastCode();
    await skipCooldown();
    await verifyAlicePhone("01812345678");
    await expectError(changePassword(alice, "s-current",
        { currentPassword: "old-password", newPassword: "new-password-1", code: passwordCode }, deps), 400, /expired or was not requested/);
});

test("repeated wrong current passwords are throttled", async () => {
    await verifyAlicePhone();
    for (let i = 0; i < 10; i++) {
        await expectError(requestPasswordOtp(alice, `wrong-${i}`, deps), 400, /incorrect/);
    }
    await expectError(requestPasswordOtp(alice, "old-password", deps), 429, /Too many wrong password attempts/);
});

// ==================== FORGOT PASSWORD ====================

const passwordOf = async (accountId: string) =>
    (await client.query<{ password: string }>("SELECT password FROM account WHERE id = $1", [accountId])).rows[0]!.password;

test("reset by email texts the code to the account's verified phone and signs out everywhere", async () => {
    await verifyAlicePhone();
    await skipCooldown();

    const result = await requestPasswordReset("  ALICE@example.com ", deps);
    expect(result.sent).toBe(true);
    expect(sent.at(-1)!.to).toBe("8801712345678");
    expect(sent.at(-1)!.message).toMatch(/password reset code/);

    await resetPasswordWithOtp({ identifier: "alice@example.com", code: lastCode(), newPassword: "brand-new-pass" }, deps);
    expect(await verifyPassword({ hash: await passwordOf("a1"), password: "brand-new-pass" })).toBe(true);
    const { rows } = await client.query<{ id: string }>("SELECT id FROM session ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual(["s-bob"]);
});

test("reset by phone number works in any common format", async () => {
    await verifyAlicePhone();
    await skipCooldown();
    expect((await requestPasswordReset("+880 1712-345678", deps)).sent).toBe(true);
    await resetPasswordWithOtp({ identifier: "01712345678", code: lastCode(), newPassword: "brand-new-pass" }, deps);
    expect(await verifyPassword({ hash: await passwordOf("a1"), password: "brand-new-pass" })).toBe(true);
});

test("unknown, unverified and banned accounts get no SMS and look the same to the caller", async () => {
    expect((await requestPasswordReset("nobody@example.com", deps)).sent).toBe(false);
    expect((await requestPasswordReset("01999999999", deps)).sent).toBe(false);
    expect((await requestPasswordReset("bob@example.com", deps)).sent).toBe(false); // no verified phone

    await verifyAlicePhone();
    await skipCooldown();
    await client.exec(`UPDATE "user" SET banned = true WHERE id = 'alice'`);
    const before = sent.length;
    expect((await requestPasswordReset("alice@example.com", deps)).sent).toBe(false);
    expect(sent.length).toBe(before);

    await expectError(resetPasswordWithOtp({ identifier: "nobody@example.com", code: "123456", newPassword: "brand-new-pass" }, deps),
        400, /expired or was not requested/);
    await expectError(requestPasswordReset("not a phone", deps), 400, /email address or a valid mobile number/);
});

test("a reset code only works for its own account and purpose", async () => {
    await verifyAlicePhone();
    await skipCooldown();
    await requestPasswordReset("alice@example.com", deps);
    const code = lastCode();

    // Bob's identifier with Alice's code: Bob has no phone, so it is refused outright.
    await expectError(resetPasswordWithOtp({ identifier: "bob@example.com", code, newPassword: "brand-new-pass" }, deps),
        400, /expired or was not requested/);
    // The reset code is not a password-change code.
    await expectError(changePassword(alice, "s-current",
        { currentPassword: "old-password", newPassword: "new-password-1", code }, deps), 400, /expired or was not requested/);

    const wrong = code === "000000" ? "111111" : "000000";
    await expectError(resetPasswordWithOtp({ identifier: "alice@example.com", code: wrong, newPassword: "brand-new-pass" }, deps),
        400, /Incorrect code\. 4 attempts left/);
    await resetPasswordWithOtp({ identifier: "alice@example.com", code, newPassword: "brand-new-pass" }, deps);
    await expectError(resetPasswordWithOtp({ identifier: "alice@example.com", code, newPassword: "another-pass-1" }, deps),
        400, /expired or was not requested/);
});

test("changing the phone cancels a pending reset code", async () => {
    await verifyAlicePhone();
    await skipCooldown();
    await requestPasswordReset("alice@example.com", deps);
    const code = lastCode();
    await skipCooldown();
    await verifyAlicePhone("01812345678");
    await expectError(resetPasswordWithOtp({ identifier: "alice@example.com", code, newPassword: "brand-new-pass" }, deps),
        400, /expired or was not requested/);
});

test("reset creates a password login if the account had none", async () => {
    await verifyAlicePhone();
    await skipCooldown();
    await client.exec("DELETE FROM account WHERE id = 'a1'");
    await requestPasswordReset("alice@example.com", deps);
    await resetPasswordWithOtp({ identifier: "alice@example.com", code: lastCode(), newPassword: "brand-new-pass" }, deps);
    const { rows } = await client.query<{ provider_id: string; password: string }>(
        "SELECT provider_id, password FROM account WHERE user_id = 'alice'");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider_id).toBe("credential");
    expect(await verifyPassword({ hash: rows[0]!.password, password: "brand-new-pass" })).toBe(true);
});
