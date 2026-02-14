CREATE TABLE "pl_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"note" text,
	"adjustment_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
