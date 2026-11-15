ALTER TABLE "sr" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
--> statement-breakpoint
ALTER TABLE "sr" ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
ALTER TABLE "sr" ADD COLUMN IF NOT EXISTS "nid_number" varchar(30);
--> statement-breakpoint
ALTER TABLE "sr" ADD COLUMN IF NOT EXISTS "emergency_contact" varchar(100);
--> statement-breakpoint
ALTER TABLE "sr" ADD COLUMN IF NOT EXISTS "notes" text;
--> statement-breakpoint
ALTER TABLE "sr" ADD COLUMN IF NOT EXISTS "profile_photo" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sr_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"sr_id" integer NOT NULL CONSTRAINT "sr_documents_sr_id_sr_id_fk" REFERENCES "public"."sr"("id") ON DELETE cascade ON UPDATE no action,
	"document_type" varchar(50) NOT NULL,
	"document_name" varchar(200) NOT NULL,
	"document_url" text NOT NULL,
	"public_id" varchar(300),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sr_documents_sr" ON "sr_documents" USING btree ("sr_id");
