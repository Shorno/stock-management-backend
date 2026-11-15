-- OPTIONAL, run only with: bun run apply-migration-0020.ts --apply --backfill-commission-company
-- Fills in the company on commissions saved before SRs could have several companies,
-- only where the answer is certain. Nothing else is changed; ambiguous rows stay NULL.

-- Order commissions: the SR's lines on that order are all from one company.
WITH single_company AS (
	SELECT "order_id", "sr_id", min("brand_id") AS "brand_id"
	FROM "wholesale_order_items"
	WHERE "sr_id" IS NOT NULL
	GROUP BY "order_id", "sr_id"
	HAVING count(DISTINCT "brand_id") = 1
)
UPDATE "order_expenses" e
SET "brand_id" = s."brand_id"
FROM single_company s
WHERE e."brand_id" IS NULL AND e."expense_type" = 'commission'
	AND e."order_id" = s."order_id" AND e."sr_id" = s."sr_id";
--> statement-breakpoint
WITH single_company AS (
	SELECT "order_id", "sr_id", min("brand_id") AS "brand_id"
	FROM "wholesale_order_items"
	WHERE "sr_id" IS NOT NULL
	GROUP BY "order_id", "sr_id"
	HAVING count(DISTINCT "brand_id") = 1
)
UPDATE "sr_commissions" c
SET "brand_id" = s."brand_id"
FROM single_company s
WHERE c."brand_id" IS NULL AND c."order_id" IS NOT NULL
	AND c."order_id" = s."order_id" AND c."sr_id" = s."sr_id";
--> statement-breakpoint
-- Manual commissions: the SR works for exactly one company.
UPDATE "sr_commissions" c
SET "brand_id" = l."brand_id"
FROM (
	SELECT "sr_id", min("brand_id") AS "brand_id" FROM "sr_brands" GROUP BY "sr_id" HAVING count(*) = 1
) l
WHERE c."brand_id" IS NULL AND c."order_id" IS NULL AND c."sr_id" = l."sr_id";
