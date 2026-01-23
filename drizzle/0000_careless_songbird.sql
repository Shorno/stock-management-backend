CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_id" text,
	"user_name" text,
	"user_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "brand" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
	"low_stock_threshold" integer DEFAULT 10,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_code_unique" UNIQUE("code")
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
CREATE TABLE "stock_batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"supplier_price" numeric(10, 2) NOT NULL,
	"sell_price" numeric(10, 2) NOT NULL,
	"initial_quantity" integer NOT NULL,
	"remaining_quantity" integer NOT NULL,
	"initial_free_qty" integer DEFAULT 0 NOT NULL,
	"remaining_free_qty" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"withdrawal_date" date NOT NULL,
	"note" text,
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
CREATE TABLE "dsr" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dsr_slug_unique" UNIQUE("slug")
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
CREATE TABLE "dsr_target" (
	"id" serial PRIMARY KEY NOT NULL,
	"dsr_id" integer NOT NULL,
	"target_month" date NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
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
CREATE TABLE "route" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "route_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "wholesale_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit" varchar(20) NOT NULL,
	"total_quantity" integer NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"free_quantity" integer DEFAULT 0 NOT NULL,
	"delivered_quantity" integer,
	"delivered_free_qty" integer,
	"sale_price" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"net" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wholesale_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"dsr_id" integer NOT NULL,
	"route_id" integer NOT NULL,
	"order_date" date NOT NULL,
	"category_id" integer,
	"brand_id" integer,
	"invoice_note" text,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'unpaid' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wholesale_orders_order_number_unique" UNIQUE("order_number")
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
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_batch_id_stock_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD CONSTRAINT "damage_return_items_return_id_damage_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."damage_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD CONSTRAINT "damage_return_items_variant_id_product_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_return_items" ADD CONSTRAINT "damage_return_items_batch_id_stock_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_returns" ADD CONSTRAINT "damage_returns_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_loan_transactions" ADD CONSTRAINT "dsr_loan_transactions_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_target" ADD CONSTRAINT "dsr_target_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_batch_id_stock_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_cash_withdrawals_date" ON "cash_withdrawals" USING btree ("withdrawal_date");--> statement-breakpoint
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
CREATE INDEX "idx_dsr_target_dsr" ON "dsr_target" USING btree ("dsr_id");--> statement-breakpoint
CREATE INDEX "idx_dsr_target_month" ON "dsr_target" USING btree ("target_month");--> statement-breakpoint
CREATE INDEX "idx_dsr_target_dsr_month" ON "dsr_target" USING btree ("dsr_id","target_month");--> statement-breakpoint
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
CREATE INDEX "idx_wholesale_order_items_order" ON "wholesale_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_order_items_product" ON "wholesale_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_order_items_batch" ON "wholesale_order_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_dsr" ON "wholesale_orders" USING btree ("dsr_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_route" ON "wholesale_orders" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_date" ON "wholesale_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_status" ON "wholesale_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_payment_status" ON "wholesale_orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_order_number" ON "wholesale_orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "idx_unit_abbreviation" ON "unit" USING btree ("abbreviation");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_brand" ON "supplier_payments" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_date" ON "supplier_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_supplier_purchases_brand" ON "supplier_purchases" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_purchases_date" ON "supplier_purchases" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "idx_user_settings_user" ON "user_settings" USING btree ("user_id");