ALTER TABLE "order_expenses" ADD COLUMN "sr_id" integer;--> statement-breakpoint
ALTER TABLE "sr_commissions" ADD COLUMN "source_type" varchar(30) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "sr_commissions" ADD COLUMN "order_id" integer;--> statement-breakpoint
ALTER TABLE "sr_commissions" ADD COLUMN "order_expense_id" integer;--> statement-breakpoint
ALTER TABLE "order_expenses" ADD CONSTRAINT "order_expenses_sr_id_sr_id_fk" FOREIGN KEY ("sr_id") REFERENCES "public"."sr"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sr_commissions" ADD CONSTRAINT "sr_commissions_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sr_commissions" ADD CONSTRAINT "sr_commissions_order_expense_id_order_expenses_id_fk" FOREIGN KEY ("order_expense_id") REFERENCES "public"."order_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_expenses_sr" ON "order_expenses" USING btree ("sr_id");--> statement-breakpoint
CREATE INDEX "idx_sr_commissions_source" ON "sr_commissions" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_sr_commissions_order" ON "sr_commissions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_sr_commissions_order_expense" ON "sr_commissions" USING btree ("order_expense_id");
