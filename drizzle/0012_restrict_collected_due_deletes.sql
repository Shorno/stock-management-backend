ALTER TABLE "due_collections" DROP CONSTRAINT IF EXISTS "due_collections_customer_due_id_order_customer_dues_id_fk";--> statement-breakpoint
ALTER TABLE "due_collections" ADD CONSTRAINT "due_collections_customer_due_id_order_customer_dues_id_fk" FOREIGN KEY ("customer_due_id") REFERENCES "public"."order_customer_dues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_due_collections" DROP CONSTRAINT IF EXISTS "dsr_due_collections_dsr_due_id_order_dsr_dues_id_fk";--> statement-breakpoint
ALTER TABLE "dsr_due_collections" ADD CONSTRAINT "dsr_due_collections_dsr_due_id_order_dsr_dues_id_fk" FOREIGN KEY ("dsr_due_id") REFERENCES "public"."order_dsr_dues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sr_due_collections" DROP CONSTRAINT IF EXISTS "sr_due_collections_sr_due_id_order_sr_dues_id_fk";--> statement-breakpoint
ALTER TABLE "sr_due_collections" ADD CONSTRAINT "sr_due_collections_sr_due_id_order_sr_dues_id_fk" FOREIGN KEY ("sr_due_id") REFERENCES "public"."order_sr_dues"("id") ON DELETE restrict ON UPDATE no action;
