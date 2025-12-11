import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import 'dotenv/config';
import {db} from "../db/config/index.js";


export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    trustedOrigins: [process.env.CLIENT_URL!],
    emailAndPassword: {
        enabled: true,
        autoSignIn : false,
    },
    advanced: {
        crossSubDomainCookies :{
            enabled : true
        },
    },
    basePath: "/api/auth",
});