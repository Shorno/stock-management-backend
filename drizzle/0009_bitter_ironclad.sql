ALTER TABLE "order_sr_dues" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "order_sr_dues" ADD CONSTRAINT "order_sr_dues_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_sr_dues_customer" ON "order_sr_dues" USING btree ("customer_id");