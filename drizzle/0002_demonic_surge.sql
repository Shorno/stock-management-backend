CREATE TABLE "bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"note" text,
	"bill_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variant" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"sku" varchar(50),
	"variant_type" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"value" numeric(10, 2),
	"unit" varchar(20),
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_variant_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer,
	"variant_id" integer NOT NULL,
	"adjustment_type" varchar(50) NOT NULL,
	"quantity" integer NOT NULL,
	"free_quantity" integer DEFAULT 0 NOT NULL,
	"order_id" integer,
	"return_id" integer,
	"note" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"shop_name" varchar(150),
	"mobile" varchar(20),
	"address" text,
	"profile_image_url" text,
	"location_url" text,
	"route_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"batch_id" integer,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"condition" varchar(20) DEFAULT 'damaged' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_number" varchar(50) NOT NULL,
	"dsr_id" integer NOT NULL,
	"return_date" date NOT NULL,
	"return_type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"approved_by_id" integer,
	"approved_at" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "damage_returns_return_number_unique" UNIQUE("return_number")
);
--> statement-breakpoint
CREATE TABLE "dsr_loan_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"dsr_id" integer NOT NULL,
	"transaction_type" varchar(20) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"transaction_date" date NOT NULL,
	"payment_method" varchar(50),
	"note" text,
	"reference_number" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "due_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_due_id" integer,
	"customer_id" integer,
	"order_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"collection_date" date NOT NULL,
	"payment_method" varchar(50),
	"collected_by_dsr_id" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_customer_dues" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"customer_id" integer,
	"customer_name" varchar(150) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"collected_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_damage_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer,
	"product_id" integer,
	"variant_id" integer,
	"product_name" varchar(200) NOT NULL,
	"variant_name" varchar(100),
	"brand_name" varchar(100) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"expense_type" varchar(50) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"return_quantity" integer DEFAULT 0 NOT NULL,
	"return_unit" varchar(20) NOT NULL,
	"return_free_quantity" integer DEFAULT 0 NOT NULL,
	"return_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"adjustment_discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"payment_method" varchar(50),
	"note" text,
	"collected_by" varchar(100),
	"collected_by_dsr_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"abbreviation" varchar(20) NOT NULL,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unit_abbreviation_unique" UNIQUE("abbreviation")
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"payment_method" varchar(50),
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"purchase_date" date NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pending_order_alert_days" integer DEFAULT 3 NOT NULL,
	"enable_pending_order_alerts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "stock_batch" DROP CONSTRAINT "stock_batch_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "code" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD COLUMN "variant_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD COLUMN "delivered_quantity" integer;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD COLUMN "delivered_free_qty" integer;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD COLUMN "paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD COLUMN "payment_status" varchar(20) DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_batch_id_stock_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD CONSTRAINT "damage_return_items_return_id_damage_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."damage_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD CONSTRAINT "damage_return_items_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD CONSTRAINT "damage_return_items_batch_id_stock_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_returns" ADD CONSTRAINT "damage_returns_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_loan_transactions" ADD CONSTRAINT "dsr_loan_transactions_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_collections" ADD CONSTRAINT "due_collections_customer_due_id_order_customer_dues_id_fk" FOREIGN KEY ("customer_due_id") REFERENCES "public"."order_customer_dues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_collections" ADD CONSTRAINT "due_collections_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_collections" ADD CONSTRAINT "due_collections_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_collections" ADD CONSTRAINT "due_collections_collected_by_dsr_id_dsr_id_fk" FOREIGN KEY ("collected_by_dsr_id") REFERENCES "public"."dsr"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_customer_dues" ADD CONSTRAINT "order_customer_dues_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_customer_dues" ADD CONSTRAINT "order_customer_dues_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD CONSTRAINT "order_damage_items_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD CONSTRAINT "order_damage_items_order_item_id_wholesale_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."wholesale_order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD CONSTRAINT "order_damage_items_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_damage_items" ADD CONSTRAINT "order_damage_items_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_expenses" ADD CONSTRAINT "order_expenses_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_returns" ADD CONSTRAINT "order_item_returns_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_returns" ADD CONSTRAINT "order_item_returns_order_item_id_wholesale_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."wholesale_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_collected_by_dsr_id_dsr_id_fk" FOREIGN KEY ("collected_by_dsr_id") REFERENCES "public"."dsr"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_customer_name" ON "customer" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_customer_route" ON "customer" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_customer_mobile" ON "customer" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "idx_damage_return_items_return" ON "damage_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "idx_damage_return_items_variant" ON "damage_return_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_damage_returns_dsr" ON "damage_returns" USING btree ("dsr_id");--> statement-breakpoint
CREATE INDEX "idx_damage_returns_date" ON "damage_returns" USING btree ("return_date");--> statement-breakpoint
CREATE INDEX "idx_damage_returns_status" ON "damage_returns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_damage_returns_number" ON "damage_returns" USING btree ("return_number");--> statement-breakpoint
CREATE INDEX "idx_dsr_loan_dsr" ON "dsr_loan_transactions" USING btree ("dsr_id");--> statement-breakpoint
CREATE INDEX "idx_dsr_loan_date" ON "dsr_loan_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_dsr_loan_type" ON "dsr_loan_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "idx_due_collections_customer_due" ON "due_collections" USING btree ("customer_due_id");--> statement-breakpoint
CREATE INDEX "idx_due_collections_customer" ON "due_collections" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_due_collections_order" ON "due_collections" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_due_collections_date" ON "due_collections" USING btree ("collection_date");--> statement-breakpoint
CREATE INDEX "idx_due_collections_dsr" ON "due_collections" USING btree ("collected_by_dsr_id");--> statement-breakpoint
CREATE INDEX "idx_order_customer_dues_order" ON "order_customer_dues" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_customer_dues_customer" ON "order_customer_dues" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_order_damage_items_order" ON "order_damage_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_damage_items_item" ON "order_damage_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_order_damage_items_product" ON "order_damage_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_order_expenses_order" ON "order_expenses" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_item_returns_order" ON "order_item_returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_item_returns_item" ON "order_item_returns" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_order_payments_order" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_payments_date" ON "order_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_order_payments_dsr" ON "order_payments" USING btree ("collected_by_dsr_id");--> statement-breakpoint
CREATE INDEX "idx_unit_abbreviation" ON "unit" USING btree ("abbreviation");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_brand" ON "supplier_payments" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_date" ON "supplier_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_supplier_purchases_brand" ON "supplier_purchases" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_purchases_date" ON "supplier_purchases" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "idx_user_settings_user" ON "user_settings" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_payment_status" ON "wholesale_orders" USING btree ("payment_status");--> statement-breakpoint
ALTER TABLE "stock_batch" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_code_unique" UNIQUE("code");