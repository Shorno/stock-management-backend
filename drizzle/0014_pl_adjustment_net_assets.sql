ALTER TABLE "pl_adjustments" ADD COLUMN "affects_net_assets" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pl_adjustments" ALTER COLUMN "affects_net_assets" SET DEFAULT true;
