import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
    // Fix existing negative values
    const fix1 = await pool.query('UPDATE stock_batch SET remaining_quantity = 0 WHERE remaining_quantity < 0');
    console.log('Fixed negative remaining_quantity rows:', fix1.rowCount);

    const fix2 = await pool.query('UPDATE stock_batch SET remaining_free_qty = 0 WHERE remaining_free_qty < 0');
    console.log('Fixed negative remaining_free_qty rows:', fix2.rowCount);

    // Add CHECK constraints
    try {
        await pool.query('ALTER TABLE stock_batch ADD CONSTRAINT stock_batch_remaining_qty_non_negative CHECK (remaining_quantity >= 0)');
        console.log('Added remaining_quantity CHECK constraint');
    } catch (e) {
        if (e.code === '42710') {
            console.log('remaining_quantity CHECK constraint already exists, skipping');
        } else {
            throw e;
        }
    }

    try {
        await pool.query('ALTER TABLE stock_batch ADD CONSTRAINT stock_batch_remaining_free_qty_non_negative CHECK (remaining_free_qty >= 0)');
        console.log('Added remaining_free_qty CHECK constraint');
    } catch (e) {
        if (e.code === '42710') {
            console.log('remaining_free_qty CHECK constraint already exists, skipping');
        } else {
            throw e;
        }
    }

    console.log('Migration complete!');
} catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
} finally {
    await pool.end();
}
