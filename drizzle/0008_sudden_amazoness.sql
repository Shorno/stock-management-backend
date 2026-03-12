CREATE TABLE "order_sr_dues" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"sr_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"collected_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sr" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sr_due_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"sr_due_id" integer,
	"sr_id" integer,
	"order_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"collection_date" date NOT NULL,
	"payment_method" varchar(50),
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_sr_dues" ADD CONSTRAINT "order_sr_dues_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_sr_dues" ADD CONSTRAINT "order_sr_dues_sr_id_sr_id_fk" FOREIGN KEY ("sr_id") REFERENCES "public"."sr"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sr_due_collections" ADD CONSTRAINT "sr_due_collections_sr_due_id_order_sr_dues_id_fk" FOREIGN KEY ("sr_due_id") REFERENCES "public"."order_sr_dues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sr_due_collections" ADD CONSTRAINT "sr_due_collections_sr_id_sr_id_fk" FOREIGN KEY ("sr_id") REFERENCES "public"."sr"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sr_due_collections" ADD CONSTRAINT "sr_due_collections_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_sr_dues_order" ON "order_sr_dues" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_sr_dues_sr" ON "order_sr_dues" USING btree ("sr_id");--> statement-breakpoint
CREATE INDEX "idx_sr_due_collections_sr_due" ON "sr_due_collections" USING btree ("sr_due_id");--> statement-breakpoint
CREATE INDEX "idx_sr_due_collections_sr" ON "sr_due_collections" USING btree ("sr_id");--> statement-breakpoint
CREATE INDEX "idx_sr_due_collections_order" ON "sr_due_collections" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_sr_due_collections_date" ON "sr_due_collections" USING btree ("collection_date");