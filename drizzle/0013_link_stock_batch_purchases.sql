ALTER TABLE "supplier_purchases" ADD COLUMN "stock_batch_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_stock_batch_id_stock_batch_id_fk" FOREIGN KEY ("stock_batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_purchases_batch" ON "supplier_purchases" USING btree ("stock_batch_id");
