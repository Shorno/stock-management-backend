import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export type OtpPurpose = "verify_phone" | "change_password" | "reset_password";

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
/** Minimum wait before a new code can be sent for the same purpose. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Wrong guesses allowed before a code is thrown away. */
export const OTP_MAX_ATTEMPTS = 5;
/** Codes (of any purpose) a user may request per rolling hour. */
export const OTP_MAX_PER_HOUR = 5;

export function generateOtpCode(): string {
    return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

function secret(): string {
    const value = process.env.BETTER_AUTH_SECRET?.trim();
    if (!value) throw new Error("BETTER_AUTH_SECRET is not set on the server");
    return value;
}

/** HMAC bound to the user and purpose, so a code for one flow never works in another. */
export function hashOtp(userId: string, purpose: OtpPurpose, code: string): string {
    return createHmac("sha256", secret()).update(`${userId}:${purpose}:${code}`).digest("hex");
}

export function otpMatches(userId: string, purpose: OtpPurpose, code: string, storedHash: string): boolean {
    const expected = Buffer.from(hashOtp(userId, purpose, code), "hex");
    const actual = Buffer.from(storedHash, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 8801712345678 -> +880 17•••••678 */
export function maskPhone(phone: string): string {
    if (phone.length < 8) return phone;
    const local = phone.startsWith("880") ? phone.slice(3) : phone;
    return `+880 ${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 5, 0))}${local.slice(-3)}`;
}

export function otpMessage(purpose: OtpPurpose, code: string): string {
    const minutes = OTP_TTL_SECONDS / 60;
    const what = purpose === "change_password" ? "password change"
        : purpose === "reset_password" ? "password reset"
        : "phone verification";
    return `${code} is your ${what} code. It expires in ${minutes} minutes. Never share this code with anyone.`;
}
