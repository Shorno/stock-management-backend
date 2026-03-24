CREATE TABLE "bill_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bill_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "bill_type_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_bill_type_id_bill_types_id_fk" FOREIGN KEY ("bill_type_id") REFERENCES "public"."bill_types"("id") ON DELETE no action ON UPDATE no action;