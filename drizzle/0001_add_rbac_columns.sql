-- Add role-based access control columns to existing user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" boolean;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ban_reason" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ban_expires" timestamp;

-- Add impersonation column to session table
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonated_by" text;
