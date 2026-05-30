ALTER TABLE "order_customer_dues" ADD COLUMN IF NOT EXISTS "entry_source" varchar(20) NOT NULL DEFAULT 'customer_due';--> statement-breakpoint
ALTER TABLE "order_customer_dues" ADD COLUMN IF NOT EXISTS "note" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_customer_dues_entry_source" ON "order_customer_dues" USING btree ("entry_source");--> statement-breakpoint
