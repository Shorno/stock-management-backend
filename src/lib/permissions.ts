import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * Custom permission statements for the stock management system.
 * Each key is a resource, and values are the available actions.
 */
export const statement = {
    ...defaultStatements,
    // Inventory resources
    product: ["create", "read", "update", "delete"],
    category: ["create", "read", "update", "delete"],
    brand: ["create", "read", "update", "delete"],
    // Sales resources
    dsr: ["create", "read", "update", "delete"],
    route: ["create", "read", "update", "delete"],
    wholesale: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

/**
 * User-management permissions for Admin: everything Better Auth's adminAc grants
 * except deleting users, which only the Super Admin may do.
 */
export const adminUserStatements = {
    ...adminAc.statements,
    user: adminAc.statements.user.filter((action) => action !== "delete"),
};

/**
 * Admin Role
 * Full access to all features including user management (but cannot delete users)
 */
export const admin = ac.newRole({
    product: ["create", "read", "update", "delete"],
    category: ["create", "read", "update", "delete"],
    brand: ["create", "read", "update", "delete"],
    dsr: ["create", "read", "update", "delete"],
    route: ["create", "read", "update", "delete"],
    wholesale: ["create", "read", "update", "delete"],
    ...adminUserStatements, // User management, minus deleting users
});

/**
 * Manager Role
 * Can manage all inventory and sales resources, but cannot manage users
 */
export const manager = ac.newRole({
    product: ["create", "read", "update", "delete"],
    category: ["create", "read", "update", "delete"],
    brand: ["create", "read", "update", "delete"],
    dsr: ["create", "read", "update", "delete"],
    route: ["create", "read", "update", "delete"],
    wholesale: ["create", "read", "update", "delete"],
});

/**
 * Super Admin Role
 * Same permissions as admin, but with exclusive access to role management and user approval.
 * This role can only be assigned directly in the database.
 */
export const superAdmin = ac.newRole({
    product: ["create", "read", "update", "delete"],
    category: ["create", "read", "update", "delete"],
    brand: ["create", "read", "update", "delete"],
    dsr: ["create", "read", "update", "delete"],
    route: ["create", "read", "update", "delete"],
    wholesale: ["create", "read", "update", "delete"],
    ...adminAc.statements,
});

/**
 * DSR (Distribution Sales Representative) Role
 * Can view products and manage wholesale orders
 */
export const dsr = ac.newRole({
    product: ["read"],
    category: ["read"],
    brand: ["read"],
    dsr: ["read"],
    route: ["read"],
    wholesale: ["create", "read", "update"],
});
