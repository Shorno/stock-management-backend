CREATE TYPE "public"."order_edit_lock_mode" AS ENUM('always', 'once');--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_edit_password" text,
	"order_edit_lock_mode" "order_edit_lock_mode" DEFAULT 'always' NOT NULL,
	"order_edit_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
