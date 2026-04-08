CREATE TABLE "dsr_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"dsr_id" integer NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"document_name" varchar(200) NOT NULL,
	"document_url" text NOT NULL,
	"public_id" varchar(300),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dsr" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "dsr" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "dsr" ADD COLUMN "nid_number" varchar(30);--> statement-breakpoint
ALTER TABLE "dsr" ADD COLUMN "emergency_contact" varchar(100);--> statement-breakpoint
ALTER TABLE "dsr" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "dsr" ADD COLUMN "profile_photo" text;--> statement-breakpoint
ALTER TABLE "order_dsr_dues" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "dsr_documents" ADD CONSTRAINT "dsr_documents_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dsr_documents_dsr" ON "dsr_documents" USING btree ("dsr_id");--> statement-breakpoint
ALTER TABLE "order_dsr_dues" ADD CONSTRAINT "order_dsr_dues_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_dsr_dues_customer" ON "order_dsr_dues" USING btree ("customer_id");