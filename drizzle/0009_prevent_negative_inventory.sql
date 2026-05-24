-- Fix existing negative remaining quantities before adding constraint
UPDATE stock_batch SET remaining_quantity = 0 WHERE remaining_quantity < 0;
UPDATE stock_batch SET remaining_free_qty = 0 WHERE remaining_free_qty < 0;

-- Add CHECK constraints to prevent negative inventory
ALTER TABLE stock_batch ADD CONSTRAINT stock_batch_remaining_qty_non_negative CHECK (remaining_quantity >= 0);
ALTER TABLE stock_batch ADD CONSTRAINT stock_batch_remaining_free_qty_non_negative CHECK (remaining_free_qty >= 0);
