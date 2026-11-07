CREATE TABLE "sms_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"company_name" varchar(150) DEFAULT '' NOT NULL,
	"auto_send_on_settlement" boolean DEFAULT true NOT NULL,
	"auto_send_on_collection" boolean DEFAULT true NOT NULL,
	"settlement_template" text DEFAULT '' NOT NULL,
	"collection_template" text DEFAULT '' NOT NULL,
	"reminder_template" text DEFAULT '' NOT NULL,
	"overdue_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"recipient_name" varchar(150),
	"phone" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"segments" integer DEFAULT 1 NOT NULL,
	"request_id" varchar(50),
	"error" text,
	"order_id" integer,
	"due_collection_id" integer,
	"sent_by_user_id" text,
	"sent_by_name" varchar(150),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_due_collection_id_due_collections_id_fk" FOREIGN KEY ("due_collection_id") REFERENCES "public"."due_collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_sent_by_user_id_user_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sms_logs_created" ON "sms_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sms_logs_customer" ON "sms_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_sms_logs_type" ON "sms_logs" USING btree ("type");
