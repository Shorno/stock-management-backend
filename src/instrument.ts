import "dotenv/config";
import * as Sentry from "@sentry/bun";

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    sendDefaultPii: true,

    // Only send events in production
    enabled: process.env.NODE_ENV === "production",

    // 20% of transactions in production to control costs
    tracesSampleRate: 0.2,
});
