import { expect, test } from "bun:test";
import { admin, manager, dsr, superAdmin } from "../src/lib/permissions";

// Better Auth's /admin/remove-user checks { user: ["delete"] }, so this decides who can delete users.
const canDeleteUsers = (role: typeof admin) => role.authorize({ user: ["delete"] }).success;

test("only the Super Admin can delete users", () => {
    expect(canDeleteUsers(superAdmin)).toBe(true);
    expect(canDeleteUsers(admin)).toBe(false);
    expect(canDeleteUsers(manager)).toBe(false);
    expect(canDeleteUsers(dsr)).toBe(false);
});

test("Admin keeps the rest of its user-management permissions", () => {
    expect(admin.authorize({ user: ["list", "set-role", "ban", "get", "update"] }).success).toBe(true);
    expect(admin.authorize({ session: ["list", "revoke", "delete"] }).success).toBe(true);
});
