ALTER TABLE "order_damage_items" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD COLUMN "customer_name" varchar(150);--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD CONSTRAINT "order_damage_items_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_damage_items_customer" ON "order_damage_items" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "order_damage_items" DROP COLUMN "reason";