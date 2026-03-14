ALTER TABLE "sr" ADD COLUMN "brand_id" integer;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD COLUMN "sr_id" integer;--> statement-breakpoint
ALTER TABLE "sr" ADD CONSTRAINT "sr_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_sr_id_sr_id_fk" FOREIGN KEY ("sr_id") REFERENCES "public"."sr"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sr_brand" ON "sr" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_order_items_sr" ON "wholesale_order_items" USING btree ("sr_id");