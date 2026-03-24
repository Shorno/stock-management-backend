ALTER TABLE "damage_returns" ALTER COLUMN "dsr_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "damage_claims" ADD COLUMN "is_write_off" boolean DEFAULT false NOT NULL;