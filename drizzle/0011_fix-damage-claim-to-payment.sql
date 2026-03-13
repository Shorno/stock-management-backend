ALTER TABLE "damage_claims" DROP CONSTRAINT "damage_claims_supplier_purchase_id_supplier_purchases_id_fk";
--> statement-breakpoint
DROP INDEX "idx_damage_claims_purchase";--> statement-breakpoint
ALTER TABLE "damage_claims" ADD COLUMN "supplier_payment_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "is_damage_credit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_supplier_payment_id_supplier_payments_id_fk" FOREIGN KEY ("supplier_payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_damage_claims_payment" ON "damage_claims" USING btree ("supplier_payment_id");--> statement-breakpoint
ALTER TABLE "damage_claims" DROP COLUMN "supplier_purchase_id";--> statement-breakpoint
ALTER TABLE "supplier_purchases" DROP COLUMN "is_damage_credit";