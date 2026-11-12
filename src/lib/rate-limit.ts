import type { Context, Next } from "hono";
import { getConnInfo } from "hono/bun";

/**
 * Small in-memory fixed-window limiter for public endpoints.
 * Per process: fine for this single-instance deployment. The per-account limits
 * on SMS codes still apply on top of this.
 */
export function rateLimit(options: { windowMs: number; max: number; prefix: string }) {
    const hits = new Map<string, { count: number; resetAt: number }>();

    return async (c: Context, next: Next) => {
        const now = Date.now();
        if (hits.size > 10_000) {
            for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
        }

        const key = `${options.prefix}:${clientIp(c)}`;
        const entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + options.windowMs });
        } else if (entry.count >= options.max) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            c.header("Retry-After", String(retryAfter));
            return c.json({ success: false, message: "Too many requests. Please try again later.", retryAfter }, 429);
        } else {
            entry.count += 1;
        }
        await next();
    };
}

/** First X-Forwarded-For hop (set by the reverse proxy), else the socket address. */
export function clientIp(c: Context): string {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const realIp = c.req.header("x-real-ip")?.trim();
    if (realIp) return realIp;
    try {
        return getConnInfo(c).remote.address ?? "unknown";
    } catch {
        return "unknown";
    }
}
