ALTER TABLE "dsr" DROP CONSTRAINT "dsr_slug_unique";--> statement-breakpoint
ALTER TABLE "route" DROP CONSTRAINT "route_slug_unique";--> statement-breakpoint
ALTER TABLE "dsr" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "route" DROP COLUMN "slug";