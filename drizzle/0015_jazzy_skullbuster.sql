CREATE TABLE "sr_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sr_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"commission_date" date NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sr_commissions" ADD CONSTRAINT "sr_commissions_sr_id_sr_id_fk" FOREIGN KEY ("sr_id") REFERENCES "public"."sr"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sr_commissions_sr" ON "sr_commissions" USING btree ("sr_id");--> statement-breakpoint
CREATE INDEX "idx_sr_commissions_date" ON "sr_commissions" USING btree ("commission_date");