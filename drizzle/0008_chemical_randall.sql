CREATE TABLE "investment_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"withdrawal_date" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"investment_date" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
