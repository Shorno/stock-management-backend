import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import 'dotenv/config';
import { eq } from "drizzle-orm";
import { db } from "../db/config";
import { user as userTable } from "../db/schema/auth-schema";
import { ac, admin as adminRole, superAdmin, manager, dsr } from "./permissions";
import { phoneSignInHook } from "./phone-sign-in";


export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    plugins: [
        admin({
            ac,
            roles: {
                admin: adminRole,
                super_admin: superAdmin,
                manager,
                dsr,
            },
            defaultRole: "dsr",
        }),
    ],
    trustedOrigins: [process.env.CLIENT_URL || "https://mstamimenterprise.shop"],
    emailAndPassword: {
        enabled: true,
        autoSignIn: false,
    },
    advanced: {
        defaultCookieAttributes: {
            sameSite: "none",
            secure: true,
            partitioned: true
        }
    },
    basePath: "/api/auth",
    // Password change and reset go through /api/account/password/* and /api/password-reset/*
    // (verified phone + SMS code). Block Better Auth's built-in routes so that cannot be skipped.
    disabledPaths: ["/change-password", "/request-password-reset", "/reset-password"],
    // Sign in with a verified mobile number as well as email.
    hooks: {
        before: phoneSignInHook,
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    // Auto-ban new DSR users - they need admin approval to login
                    if (user.role === 'dsr' || !user.role) {
                        await db.update(userTable).set({ banned: true }).where(eq(userTable.id, user.id));
                    }
                }
            }
        }
    }
});
