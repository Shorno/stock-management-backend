import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { logError } from "../../lib/error-handler";
import { auditLog } from "../../lib/audit-logger";
import { rateLimit } from "../../lib/rate-limit";
import * as accountService from "./service";
import { OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS } from "./otp";
import { requestPasswordResetSchema, resetPasswordSchema } from "./validation";

/**
 * Forgot password, used from the login page (no session).
 * The user gives an email or a mobile number; the code always goes to the
 * mobile number verified on that account.
 */
const app = new Hono();

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const validationHook = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: Context) => {
    if (!result.success) {
        return c.json({ success: false, message: result.error?.issues[0]?.message ?? "Validation failed" }, 400);
    }
};

const fail = (c: Context, label: string, error: unknown) => {
    if (error instanceof accountService.AccountError) {
        if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
        return c.json({ success: false, message: error.message, retryAfter: error.retryAfter }, error.status);
    }
    logError(label, error);
    return c.json({ success: false, message: label }, 500);
};

app.post(
    "/send-otp",
    rateLimit({ prefix: "reset-send", windowMs: FIFTEEN_MINUTES, max: 10 }),
    zValidator("json", requestPasswordResetSchema, validationHook),
    async (c) => {
        try {
            await accountService.requestPasswordReset(c.req.valid("json").identifier);
            // Same answer whether or not an account matched.
            return c.json({
                success: true,
                data: { expiresInSeconds: OTP_TTL_SECONDS, resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS },
                message: "If this account has a verified mobile number, a reset code has been sent to it.",
            });
        } catch (error) {
            return fail(c, "Failed to send reset code", error);
        }
    },
);

app.post(
    "/confirm",
    rateLimit({ prefix: "reset-confirm", windowMs: FIFTEEN_MINUTES, max: 30 }),
    zValidator("json", resetPasswordSchema, validationHook),
    async (c) => {
        try {
            const result = await accountService.resetPasswordWithOtp(c.req.valid("json"));
            await auditLog({
                context: c, userId: result.userId, userName: result.userName, action: "UPDATE", entityType: "user",
                entityId: result.userId, entityName: result.userName,
                metadata: { event: "password_reset", sessionsSignedOut: result.sessionsSignedOut },
            });
            return c.json({ success: true, message: "Password reset. You can now log in with your new password." });
        } catch (error) {
            return fail(c, "Failed to reset password", error);
        }
    },
);

export default app;
