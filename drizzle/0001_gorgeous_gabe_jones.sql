CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_id" text,
	"user_name" text,
	"user_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "dsr_target" (
	"id" serial PRIMARY KEY NOT NULL,
	"dsr_id" integer NOT NULL,
	"target_month" date NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_target" ADD CONSTRAINT "dsr_target_dsr_id_dsr_id_fk" FOREIGN KEY ("dsr_id") REFERENCES "public"."dsr"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_dsr_target_dsr" ON "dsr_target" USING btree ("dsr_id");--> statement-breakpoint
CREATE INDEX "idx_dsr_target_month" ON "dsr_target" USING btree ("target_month");--> statement-breakpoint
CREATE INDEX "idx_dsr_target_dsr_month" ON "dsr_target" USING btree ("dsr_id","target_month");