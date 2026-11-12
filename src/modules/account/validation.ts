import { z } from "zod";

const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");
const currentPassword = z.string().min(1, "Current password is required").max(128);

export const sendPhoneOtpSchema = z.object({
    phone: z.string().trim().min(1, "Mobile number is required").max(20),
});

export const verifyPhoneOtpSchema = z.object({ code });

export const sendPasswordOtpSchema = z.object({ currentPassword });

export const changePasswordSchema = z.object({
    currentPassword,
    newPassword: z.string()
        .min(8, "New password must be at least 8 characters")
        .max(128, "New password must be at most 128 characters"),
    code,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const identifier = z.string().trim().min(1, "Enter your email address or mobile number").max(254);

export const requestPasswordResetSchema = z.object({ identifier });

export const resetPasswordSchema = z.object({
    identifier,
    code,
    newPassword: z.string()
        .min(8, "New password must be at least 8 characters")
        .max(128, "New password must be at most 128 characters"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
