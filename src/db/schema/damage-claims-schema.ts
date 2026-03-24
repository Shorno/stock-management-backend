import { pgTable, serial, integer, decimal, text, date, index, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../column.helpers";
import { brand } from "./product-schema";
import { supplierPayments } from "./supplier-schema";

// ==================== DAMAGE CLAIMS ====================
// Records claims/settlements made against a company's approved damage items.
// Each claim creates a supplier payment (with isDamageCredit=true) on the supplier ledger.
// Write-offs are uncollectable damage amounts that reduce the damage asset without supplier credit.

export const damageClaims = pgTable("damage_claims", {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
        .notNull()
        .references(() => brand.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    claimDate: date("claim_date").notNull(),
    supplierPaymentId: integer("supplier_payment_id")
        .references(() => supplierPayments.id, { onDelete: "set null" }),
    isWriteOff: boolean("is_write_off").default(false).notNull(),
    note: text("note"),
    ...timestamps
}, (table) => ({
    brandIdx: index("idx_damage_claims_brand").on(table.brandId),
    dateIdx: index("idx_damage_claims_date").on(table.claimDate),
    paymentIdx: index("idx_damage_claims_payment").on(table.supplierPaymentId),
}));

// ==================== RELATIONS ====================

export const damageClaimsRelations = relations(damageClaims, ({ one }) => ({
    brand: one(brand, {
        fields: [damageClaims.brandId],
        references: [brand.id],
    }),
    supplierPayment: one(supplierPayments, {
        fields: [damageClaims.supplierPaymentId],
        references: [supplierPayments.id],
    }),
}));
