import { and, count, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { db } from "../../db/config";
import { account, phoneOtp, session, smsLogs, user as userTable, userPhone, type PhoneOtp } from "../../db/schema";
import { logError } from "../../lib/error-handler";
import { isSmsConfigured, sendSms, type SendResult } from "../sms/alpha-sms";
import { countSegments, normalizeBdPhone } from "../sms/template";
import {
    OTP_MAX_ATTEMPTS,
    OTP_MAX_PER_HOUR,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_SECONDS,
    generateOtpCode,
    hashOtp,
    maskPhone,
    otpMatches,
    otpMessage,
    type OtpPurpose,
} from "./otp";
import type { ChangePasswordInput, ResetPasswordInput } from "./validation";

type Database = typeof db;

/** Overridable in tests so no real database or SMS gateway is touched. */
export interface AccountDeps {
    database?: Database;
    send?: (to: string, message: string) => Promise<SendResult>;
    smsConfigured?: () => boolean;
}

export interface AccountUser {
    id: string;
    name?: string | null;
}

export class AccountError extends Error {
    constructor(message: string, public status: 400 | 403 | 404 | 409 | 429 | 502 | 503 = 400, public retryAfter?: number) {
        super(message);
        this.name = "AccountError";
    }
}

const resolve = (deps: AccountDeps = {}) => ({
    database: deps.database ?? db,
    send: deps.send ?? sendSms,
    smsConfigured: deps.smsConfigured ?? isSmsConfigured,
});

// ==================== WRONG PASSWORD THROTTLE ====================

const PASSWORD_FAILURE_LIMIT = 10;
const PASSWORD_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const passwordFailures = new Map<string, { count: number; resetAt: number }>();

function assertPasswordTriesLeft(userId: string) {
    const entry = passwordFailures.get(userId);
    if (!entry) return;
    if (entry.resetAt <= Date.now()) {
        passwordFailures.delete(userId);
        return;
    }
    if (entry.count >= PASSWORD_FAILURE_LIMIT) {
        throw new AccountError("Too many wrong password attempts. Try again in 15 minutes.", 429,
            Math.ceil((entry.resetAt - Date.now()) / 1000));
    }
}

function recordPasswordFailure(userId: string) {
    const entry = passwordFailures.get(userId);
    if (!entry || entry.resetAt <= Date.now()) {
        passwordFailures.set(userId, { count: 1, resetAt: Date.now() + PASSWORD_FAILURE_WINDOW_MS });
    } else {
        entry.count += 1;
    }
}

/** Test helper. */
export function resetPasswordThrottle() {
    passwordFailures.clear();
}

// ==================== LOOKUPS ====================

async function getVerifiedPhone(database: Database, userId: string) {
    const [row] = await database.select().from(userPhone).where(eq(userPhone.userId, userId)).limit(1);
    return row ?? null;
}

async function getCredentialAccount(database: Database, userId: string) {
    const [row] = await database
        .select({ id: account.id, password: account.password })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
        .limit(1);
    return row?.password ? { id: row.id, password: row.password } : null;
}

export async function getSecurityStatus(userId: string, deps?: AccountDeps) {
    const { database, smsConfigured } = resolve(deps);
    const [phone, credential] = await Promise.all([
        getVerifiedPhone(database, userId),
        getCredentialAccount(database, userId),
    ]);
    return {
        phone: phone?.phone ?? null,
        maskedPhone: phone ? maskPhone(phone.phone) : null,
        phoneVerifiedAt: phone?.verifiedAt ?? null,
        hasPassword: Boolean(credential),
        canChangePassword: Boolean(phone && credential),
        smsAvailable: smsConfigured(),
        otp: { length: 6, ttlSeconds: OTP_TTL_SECONDS, resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS },
    };
}

// ==================== OTP CORE ====================

/**
 * Creates and texts a new code. Earlier unused codes for the same purpose stop working.
 * All time math runs in Postgres (now()) so app/DB time zones never disagree.
 */
async function issueOtp(user: AccountUser, purpose: OtpPurpose, phone: string, deps?: AccountDeps) {
    const { database, send, smsConfigured } = resolve(deps);
    if (!smsConfigured()) {
        throw new AccountError("SMS is not configured on the server, so codes cannot be sent. Contact your administrator.", 503);
    }

    const [recent] = await database
        .select({
            wait: sql<number>`CEIL(EXTRACT(EPOCH FROM (${phoneOtp.createdAt} + make_interval(secs => ${OTP_RESEND_COOLDOWN_SECONDS}) - now())))::int`,
        })
        .from(phoneOtp)
        .where(and(
            eq(phoneOtp.userId, user.id),
            eq(phoneOtp.purpose, purpose),
            sql`${phoneOtp.createdAt} > now() - make_interval(secs => ${OTP_RESEND_COOLDOWN_SECONDS})`,
        ))
        .orderBy(desc(phoneOtp.createdAt))
        .limit(1);
    if (recent && recent.wait > 0) {
        throw new AccountError(`Please wait ${recent.wait} seconds before requesting another code.`, 429, recent.wait);
    }

    const [hourly] = await database
        .select({ total: count() })
        .from(phoneOtp)
        .where(and(eq(phoneOtp.userId, user.id), sql`${phoneOtp.createdAt} > now() - interval '1 hour'`));
    if ((hourly?.total ?? 0) >= OTP_MAX_PER_HOUR) {
        throw new AccountError("Too many codes requested. Try again in an hour.", 429, 3600);
    }

    const code = generateOtpCode();
    const [row] = await database.transaction(async (tx) => {
        await tx.update(phoneOtp)
            .set({ consumedAt: sql`now()` })
            .where(and(eq(phoneOtp.userId, user.id), eq(phoneOtp.purpose, purpose), isNull(phoneOtp.consumedAt)));
        return tx.insert(phoneOtp).values({
            userId: user.id,
            purpose,
            phone,
            codeHash: hashOtp(user.id, purpose, code),
            expiresAt: sql`now() + make_interval(secs => ${OTP_TTL_SECONDS})`,
        }).returning({ id: phoneOtp.id });
    });
    if (!row) throw new Error("Failed to create verification code");

    const message = otpMessage(purpose, code);
    const result = await send(phone, message);

    // Logged for SMS cost tracking; the code itself is never stored in plain text.
    try {
        await database.insert(smsLogs).values({
            recipientName: user.name ?? null,
            phone,
            message: message.replace(code, "******"),
            type: "otp",
            status: result.ok ? "sent" : "failed",
            segments: countSegments(message).segments,
            requestId: result.requestId ?? null,
            error: result.error ?? null,
            sentByUserId: user.id,
            sentByName: user.name ?? null,
        });
    } catch (error) {
        logError("Failed to write OTP SMS log:", error);
    }

    if (!result.ok) {
        await database.update(phoneOtp).set({ consumedAt: sql`now()` }).where(eq(phoneOtp.id, row.id));
        throw new AccountError(`Could not send the code: ${result.error ?? "SMS failed"}`, 502);
    }

    return {
        maskedPhone: maskPhone(phone),
        expiresInSeconds: OTP_TTL_SECONDS,
        resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
}

async function findActiveOtp(database: Database, userId: string, purpose: OtpPurpose): Promise<PhoneOtp> {
    const [row] = await database.select().from(phoneOtp)
        .where(and(
            eq(phoneOtp.userId, userId),
            eq(phoneOtp.purpose, purpose),
            isNull(phoneOtp.consumedAt),
            gt(phoneOtp.expiresAt, sql`now()`),
        ))
        .orderBy(desc(phoneOtp.createdAt))
        .limit(1);
    if (!row) throw new AccountError("The code has expired or was not requested. Request a new code.");
    return row;
}

/** Counts a failed try; the code is thrown away once it runs out of tries. */
async function rejectAttempt(database: Database, otp: PhoneOtp, reason: string): Promise<never> {
    const attempts = otp.attempts + 1;
    const exhausted = attempts >= OTP_MAX_ATTEMPTS;
    await database.update(phoneOtp)
        .set({ attempts, ...(exhausted ? { consumedAt: sql`now()` } : {}) })
        .where(eq(phoneOtp.id, otp.id));
    if (exhausted) throw new AccountError(`${reason} Too many failed attempts. Request a new code.`);
    const left = OTP_MAX_ATTEMPTS - attempts;
    throw new AccountError(`${reason} ${left} attempt${left === 1 ? "" : "s"} left.`);
}

async function checkCode(database: Database, userId: string, purpose: OtpPurpose, code: string) {
    const otp = await findActiveOtp(database, userId, purpose);
    if (!otpMatches(userId, purpose, code, otp.codeHash)) await rejectAttempt(database, otp, "Incorrect code.");
    return otp;
}

/** Marks the code used. Fails if a parallel request already used it. */
async function spendOtp(database: Database, otpId: number) {
    const spent = await database.update(phoneOtp)
        .set({ consumedAt: sql`now()` })
        .where(and(eq(phoneOtp.id, otpId), isNull(phoneOtp.consumedAt)))
        .returning({ id: phoneOtp.id });
    if (spent.length === 0) throw new AccountError("This code was already used. Request a new code.");
}

function isUniqueViolation(error: unknown): boolean {
    const err = error as { code?: string; cause?: { code?: string } };
    return err?.code === "23505" || err?.cause?.code === "23505";
}

// ==================== PHONE VERIFICATION ====================

export async function requestPhoneOtp(user: AccountUser, rawPhone: string, deps?: AccountDeps) {
    const { database } = resolve(deps);
    const phone = normalizeBdPhone(rawPhone);
    if (!phone) throw new AccountError("Enter a valid Bangladeshi mobile number, like 01712345678.");

    const [owner] = await database.select({ userId: userPhone.userId }).from(userPhone).where(eq(userPhone.phone, phone)).limit(1);
    if (owner?.userId === user.id) throw new AccountError("This number is already verified on your account.");
    if (owner) throw new AccountError("This number is already linked to another account.", 409);

    return issueOtp(user, "verify_phone", phone, deps);
}

export async function verifyPhoneOtp(user: AccountUser, code: string, deps?: AccountDeps) {
    const { database } = resolve(deps);
    const otp = await checkCode(database, user.id, "verify_phone", code);

    try {
        await database.transaction(async (tx) => {
            await spendOtp(tx as unknown as Database, otp.id);
            await tx.insert(userPhone)
                .values({ userId: user.id, phone: otp.phone, verifiedAt: sql`now()` })
                .onConflictDoUpdate({
                    target: userPhone.userId,
                    set: { phone: otp.phone, verifiedAt: sql`now()`, updatedAt: sql`now()` },
                });
            // Password codes sent to the old number must not stay usable.
            await tx.update(phoneOtp)
                .set({ consumedAt: sql`now()` })
                .where(and(
                    eq(phoneOtp.userId, user.id),
                    inArray(phoneOtp.purpose, ["change_password", "reset_password"]),
                    isNull(phoneOtp.consumedAt),
                ));
        });
    } catch (error) {
        if (isUniqueViolation(error)) throw new AccountError("This number is already linked to another account.", 409);
        throw error;
    }

    return { phone: otp.phone, maskedPhone: maskPhone(otp.phone) };
}

// ==================== PASSWORD CHANGE ====================

async function requirePasswordChangeSetup(database: Database, userId: string) {
    const phone = await getVerifiedPhone(database, userId);
    if (!phone) throw new AccountError("Add and verify a mobile number before changing your password.", 403);
    const credential = await getCredentialAccount(database, userId);
    if (!credential) throw new AccountError("This account does not use a password.", 400);
    return { phone, credential };
}

async function checkCurrentPassword(userId: string, hash: string, password: string) {
    assertPasswordTriesLeft(userId);
    const ok = await verifyPassword({ hash, password });
    if (!ok) recordPasswordFailure(userId);
    return ok;
}

export async function requestPasswordOtp(user: AccountUser, currentPassword: string, deps?: AccountDeps) {
    const { database } = resolve(deps);
    const { phone, credential } = await requirePasswordChangeSetup(database, user.id);
    if (!(await checkCurrentPassword(user.id, credential.password, currentPassword))) {
        throw new AccountError("Current password is incorrect.");
    }
    return issueOtp(user, "change_password", phone.phone, deps);
}

/**
 * Needs a verified phone, the current password and a code texted to that phone.
 * On success every other session of the user is signed out.
 */
export async function changePassword(user: AccountUser, currentSessionId: string | null, input: ChangePasswordInput, deps?: AccountDeps) {
    const { database } = resolve(deps);
    if (input.newPassword === input.currentPassword) {
        throw new AccountError("New password must be different from the current password.");
    }
    const { phone, credential } = await requirePasswordChangeSetup(database, user.id);

    const otp = await checkCode(database, user.id, "change_password", input.code);
    if (otp.phone !== phone.phone) {
        await spendOtp(database, otp.id).catch(() => undefined);
        throw new AccountError("Your mobile number changed after the code was sent. Request a new code.");
    }
    if (!(await checkCurrentPassword(user.id, credential.password, input.currentPassword))) {
        await rejectAttempt(database, otp, "Current password is incorrect.");
    }

    const newHash = await hashPassword(input.newPassword);
    const signedOut = await database.transaction(async (tx) => {
        await spendOtp(tx as unknown as Database, otp.id);
        await tx.update(account).set({ password: newHash }).where(eq(account.id, credential.id));
        const removed = await tx.delete(session)
            .where(currentSessionId
                ? and(eq(session.userId, user.id), ne(session.id, currentSessionId))
                : eq(session.userId, user.id))
            .returning({ id: session.id });
        return removed.length;
    });

    passwordFailures.delete(user.id);
    return { otherSessionsSignedOut: signedOut };
}

// ==================== FORGOT PASSWORD (signed out) ====================

interface ResetTarget {
    id: string;
    name: string;
    banned: boolean | null;
    phone: string | null;
}

/** Finds an account by email, or by the mobile number verified on it. */
async function findResetTarget(database: Database, identifier: string): Promise<ResetTarget | null> {
    const value = identifier.trim();
    const columns = { id: userTable.id, name: userTable.name, banned: userTable.banned, phone: userPhone.phone };

    if (value.includes("@")) {
        const [row] = await database.select(columns).from(userTable)
            .leftJoin(userPhone, eq(userPhone.userId, userTable.id))
            .where(eq(sql`lower(${userTable.email})`, value.toLowerCase()))
            .limit(1);
        return row ?? null;
    }

    const phone = normalizeBdPhone(value);
    if (!phone) throw new AccountError("Enter your email address or a valid mobile number, like 01712345678.");
    const [row] = await database.select(columns).from(userPhone)
        .innerJoin(userTable, eq(userTable.id, userPhone.userId))
        .where(eq(userPhone.phone, phone))
        .limit(1);
    return row ?? null;
}

const canReset = (target: ResetTarget | null): target is ResetTarget & { phone: string } =>
    Boolean(target?.phone && !target.banned);

/**
 * Texts a reset code to the account's verified mobile number.
 * `sent` is for logs and tests only: callers must answer the same way either way,
 * so the endpoint does not reveal which emails or numbers have accounts.
 */
export async function requestPasswordReset(identifier: string, deps?: AccountDeps) {
    const { database } = resolve(deps);
    const target = await findResetTarget(database, identifier);
    if (!canReset(target)) return { sent: false as const };
    await issueOtp({ id: target.id, name: target.name }, "reset_password", target.phone, deps);
    return { sent: true as const, userId: target.id, userName: target.name };
}

/** Sets a new password with a reset code and signs the user out everywhere. */
export async function resetPasswordWithOtp(input: ResetPasswordInput, deps?: AccountDeps) {
    const { database } = resolve(deps);
    const target = await findResetTarget(database, input.identifier);
    if (!canReset(target)) throw new AccountError("The code has expired or was not requested. Request a new code.");

    const otp = await checkCode(database, target.id, "reset_password", input.code);
    if (otp.phone !== target.phone) {
        await spendOtp(database, otp.id).catch(() => undefined);
        throw new AccountError("The mobile number on this account changed after the code was sent. Request a new code.");
    }

    const newHash = await hashPassword(input.newPassword);
    const signedOut = await database.transaction(async (tx) => {
        await spendOtp(tx as unknown as Database, otp.id);
        const updated = await tx.update(account)
            .set({ password: newHash })
            .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")))
            .returning({ id: account.id });
        if (updated.length === 0) {
            await tx.insert(account).values({
                id: crypto.randomUUID(),
                accountId: target.id,
                providerId: "credential",
                userId: target.id,
                password: newHash,
            });
        }
        const removed = await tx.delete(session).where(eq(session.userId, target.id)).returning({ id: session.id });
        return removed.length;
    });

    passwordFailures.delete(target.id);
    return { userId: target.id, userName: target.name, sessionsSignedOut: signedOut };
}
