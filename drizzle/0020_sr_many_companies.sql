CREATE TABLE IF NOT EXISTS "sr_brands" (
	"sr_id" integer NOT NULL CONSTRAINT "sr_brands_sr_id_sr_id_fk" REFERENCES "public"."sr"("id") ON DELETE cascade ON UPDATE no action,
	"brand_id" integer NOT NULL CONSTRAINT "sr_brands_brand_id_brand_id_fk" REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sr_brands_pkey" PRIMARY KEY("sr_id","brand_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sr_brands_brand" ON "sr_brands" USING btree ("brand_id");
--> statement-breakpoint
-- Every SR keeps the company it has today.
INSERT INTO "sr_brands" ("sr_id", "brand_id")
SELECT "id", "brand_id" FROM "sr" WHERE "brand_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "order_expenses" ADD COLUMN IF NOT EXISTS "brand_id" integer;
--> statement-breakpoint
ALTER TABLE "sr_commissions" ADD COLUMN IF NOT EXISTS "brand_id" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "order_expenses" ADD CONSTRAINT "order_expenses_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sr_commissions" ADD CONSTRAINT "sr_commissions_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
