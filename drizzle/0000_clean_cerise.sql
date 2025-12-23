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
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
	"low_stock_threshold" integer DEFAULT 10,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
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
CREATE TABLE "dsr" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dsr_slug_unique" UNIQUE("slug")
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
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wholesale_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_batch_id_stock_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_wholesale_order_items_order" ON "wholesale_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_order_items_product" ON "wholesale_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_order_items_batch" ON "wholesale_order_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_dsr" ON "wholesale_orders" USING btree ("dsr_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_route" ON "wholesale_orders" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_date" ON "wholesale_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_status" ON "wholesale_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_order_number" ON "wholesale_orders" USING btree ("order_number");