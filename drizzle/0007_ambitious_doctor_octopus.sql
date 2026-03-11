ALTER TABLE "stock_batch" ALTER COLUMN "supplier_price" SET DATA TYPE numeric(12, 6);--> statement-breakpoint
ALTER TABLE "stock_batch" ALTER COLUMN "sell_price" SET DATA TYPE numeric(12, 6);--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ALTER COLUMN "sale_price" SET DATA TYPE numeric(12, 6);