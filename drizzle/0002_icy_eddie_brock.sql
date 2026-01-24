CREATE TABLE "order_dsr_dues" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"dsr_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_dsr_dues" ADD CONSTRAINT "order_dsr_dues_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_dsr_dues" ADD CONSTRAINT "order_dsr_dues_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_dsr_dues_order" ON "order_dsr_dues" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_dsr_dues_dsr" ON "order_dsr_dues" USING btree ("dsr_id");