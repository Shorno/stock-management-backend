-- Migration: Add selling_price column to order_damage_items table
-- For existing rows, set selling_price = unit_price (backward compatibility)

-- Step 1: Add column as nullable first
ALTER TABLE "order_damage_items" ADD COLUMN "selling_price" numeric(10, 2);

-- Step 2: Update existing rows to set selling_price = unit_price
UPDATE "order_damage_items" SET "selling_price" = "unit_price" WHERE "selling_price" IS NULL;

-- Step 3: Make the column NOT NULL
ALTER TABLE "order_damage_items" ALTER COLUMN "selling_price" SET NOT NULL;