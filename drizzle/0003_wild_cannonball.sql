CREATE TABLE "net_asset_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_type" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_asset_change" numeric(12, 2) DEFAULT '0' NOT NULL,
	"affected_component" varchar(50) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" integer,
	"transaction_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
