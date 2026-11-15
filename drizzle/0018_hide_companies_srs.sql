ALTER TABLE "brand" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "sr" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
