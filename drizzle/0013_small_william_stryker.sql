CREATE TABLE "inventory_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" date NOT NULL,
	"batch_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"variant_label" varchar(100) NOT NULL,
	"brand_name" varchar(100) NOT NULL,
	"supplier_price" numeric(12, 6) NOT NULL,
	"sell_price" numeric(12, 6) NOT NULL,
	"remaining_quantity" integer NOT NULL,
	"remaining_free_qty" integer DEFAULT 0 NOT NULL,
	"unit" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_inventory_snapshots_date" ON "inventory_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_inventory_snapshots_date_batch" ON "inventory_snapshots" USING btree ("snapshot_date","batch_id");