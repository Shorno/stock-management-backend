ALTER TABLE "global_settings" ADD COLUMN "sr_opening_balance_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "global_settings" ADD COLUMN "dsr_opening_balance_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "global_settings" ADD COLUMN "supplier_opening_balance_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "global_settings" ADD COLUMN "opening_balances_tab_enabled" boolean DEFAULT true NOT NULL;