ALTER TABLE "brand" DROP CONSTRAINT "brand_slug_unique";--> statement-breakpoint
ALTER TABLE "category" DROP CONSTRAINT "category_slug_unique";--> statement-breakpoint
ALTER TABLE "brand" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "category" DROP COLUMN "slug";