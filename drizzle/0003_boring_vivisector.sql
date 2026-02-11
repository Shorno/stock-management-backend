CREATE TABLE "dsr_due_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"dsr_due_id" integer,
	"dsr_id" integer,
	"order_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"collection_date" date NOT NULL,
	"payment_method" varchar(50),
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dsr_due_collections" ADD CONSTRAINT "dsr_due_collections_dsr_due_id_order_dsr_dues_id_fk" FOREIGN KEY ("dsr_due_id") REFERENCES "public"."order_dsr_dues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_due_collections" ADD CONSTRAINT "dsr_due_collections_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_due_collections" ADD CONSTRAINT "dsr_due_collections_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dsr_due_collections_dsr_due" ON "dsr_due_collections" USING btree ("dsr_due_id");--> statement-breakpoint
CREATE INDEX "idx_dsr_due_collections_dsr" ON "dsr_due_collections" USING btree ("dsr_id");--> statement-breakpoint
CREATE INDEX "idx_dsr_due_collections_order" ON "dsr_due_collections" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_dsr_due_collections_date" ON "dsr_due_collections" USING btree ("collection_date");