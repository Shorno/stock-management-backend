import type { Context, Next } from "hono";
import { auth } from "./auth";

type AuthContext = Context<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null;
    };
}>;

type UserRole = "admin" | "manager" | "dsr";

/**
 * Middleware that requires the user to be authenticated.
 * Returns 401 Unauthorized if no valid session exists.
 */
export function requireAuth() {
    return async (c: AuthContext, next: Next) => {
        const user = c.get("user");
        if (!user) {
            return c.json({ error: "Unauthorized" }, 401);
        }
        await next();
    };
}

/**
 * Middleware that requires the user to have one of the specified roles.
 * Returns 401 if not authenticated, 403 if role not allowed.
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export function requireRole(allowedRoles: UserRole[]) {
    return async (c: AuthContext, next: Next) => {
        const user = c.get("user");

        console.log(user)

        if (!user) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const userRole = (user.role as UserRole) || "dsr";

        if (!allowedRoles.includes(userRole)) {
            return c.json({ error: "Forbidden: Insufficient permissions" }, 403);
        }

        await next();
    };
}

/**
 * Middleware that checks if user has specific permission on a resource.
 * Uses Better Auth's permission checking API.
 * @param resource - The resource to check (e.g., "product", "wholesale")
 * @param actions - The actions to check (e.g., ["create", "update"])
 */
export function requirePermission(resource: string, actions: string[]) {
    return async (c: AuthContext, next: Next) => {
        const user = c.get("user");

        if (!user) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const result = await auth.api.userHasPermission({
            body: {
                userId: user.id,
                permissions: {
                    [resource]: actions,
                },
            },
        });

        if (!result.success) {
            return c.json({ error: "Forbidden: Insufficient permissions" }, 403);
        }

        await next();
    };
}

/**
 * Check if a user has admin role
 */
export function isAdmin(user: typeof auth.$Infer.Session.user | null): boolean {
    return user?.role === "admin";
}

/**
 * Check if a user has manager role or higher
 */
export function isManagerOrAdmin(user: typeof auth.$Infer.Session.user | null): boolean {
    return user?.role === "admin" || user?.role === "manager";
}
