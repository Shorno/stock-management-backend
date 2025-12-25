import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import 'dotenv/config';
import { db } from "../db/config";
import { ac, admin as adminRole, manager, dsr } from "./permissions";


export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    plugins: [
        admin({
            ac,
            roles: {
                admin: adminRole,
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
});
