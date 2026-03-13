CREATE TABLE "damage_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"claim_date" date NOT NULL,
	"supplier_purchase_id" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD COLUMN "approved_at" date;--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD COLUMN "approved_by_id" integer;--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD COLUMN "approved_at" date;--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD COLUMN "approved_by_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_purchases" ADD COLUMN "is_damage_credit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_supplier_purchase_id_supplier_purchases_id_fk" FOREIGN KEY ("supplier_purchase_id") REFERENCES "public"."supplier_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_damage_claims_brand" ON "damage_claims" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_damage_claims_date" ON "damage_claims" USING btree ("claim_date");--> statement-breakpoint
CREATE INDEX "idx_damage_claims_purchase" ON "damage_claims" USING btree ("supplier_purchase_id");