import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {db} from "../db/config";
import 'dotenv/config';


export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    trustedOrigins: [process.env.CLIENT_URL!],
    emailAndPassword: {
        enabled: true,
        autoSignIn : false,
    },
    basePath: "/api/auth",
});