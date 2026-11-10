// Reset a user's password and role directly in the database.
// Usage: bun run src/db/reset-user.ts <email> <newPassword> [role]
// Role defaults to "super_admin". Also unbans the user.
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./config";
import { account, user } from "./schema/auth-schema";

const [email, newPassword, role = "super_admin"] = process.argv.slice(2);

if (!email || !newPassword) {
    console.error("Usage: bun run src/db/reset-user.ts <email> <newPassword> [role]");
    process.exit(1);
}

const [found] = await db.select().from(user).where(eq(user.email, email));
if (!found) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
}

const hashed = await hashPassword(newPassword);

await db.transaction(async (tx) => {
    const updatedAccounts = await tx
        .update(account)
        .set({ password: hashed })
        .where(and(eq(account.userId, found.id), eq(account.providerId, "credential")))
        .returning({ id: account.id });

    if (updatedAccounts.length === 0) {
        await tx.insert(account).values({
            id: crypto.randomUUID(),
            accountId: found.id,
            providerId: "credential",
            userId: found.id,
            password: hashed,
        });
    }

    await tx
        .update(user)
        .set({ role, banned: false, banReason: null, banExpires: null })
        .where(eq(user.id, found.id));
});

const [after] = await db
    .select({ email: user.email, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, found.id));
console.log("Updated:", after);
process.exit(0);
