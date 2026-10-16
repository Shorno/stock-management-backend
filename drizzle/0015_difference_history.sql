ALTER TABLE "net_asset_ledger" ADD COLUMN "investment_balance_after" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "net_asset_ledger" ADD COLUMN "profit_after" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "net_asset_ledger" ADD COLUMN "difference_after" numeric(14, 2);
