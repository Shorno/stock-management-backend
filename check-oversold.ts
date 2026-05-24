import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
    // Summary of all over-sold batches
    const result = await pool.query(`
        SELECT 
            sb.id AS batch_id,
            p.name AS product_name,
            pv.label AS variant_label,
            sb.initial_quantity,
            sb.remaining_quantity,
            COALESCE(SUM(woi.total_quantity - woi.free_quantity), 0)::int AS total_sold,
            (COALESCE(SUM(woi.total_quantity - woi.free_quantity), 0) - sb.initial_quantity)::int AS over_sold_by,
            sb.created_at::date AS batch_date
        FROM stock_batch sb
        JOIN product_variant pv ON sb.variant_id = pv.id
        JOIN product p ON pv.product_id = p.id
        LEFT JOIN wholesale_order_items woi ON woi.batch_id = sb.id
        GROUP BY sb.id, p.name, pv.label, sb.initial_quantity, sb.remaining_quantity, sb.created_at
        HAVING COALESCE(SUM(woi.total_quantity - woi.free_quantity), 0) > sb.initial_quantity
        ORDER BY p.name, pv.label, sb.created_at
    `);

    console.log(`\n=== OVER-SOLD BATCHES SUMMARY: ${result.rows.length} batches affected ===\n`);
    console.log('Batch ID | Product | Variant | Batch Date | Initial | Sold | Over-sold | Current Remaining');
    console.log('-'.repeat(120));
    
    let totalOverSold = 0;
    for (const row of result.rows) {
        totalOverSold += parseInt(row.over_sold_by);
        console.log(
            `#${row.batch_id.toString().padEnd(6)} | ${row.product_name.substring(0, 30).padEnd(30)} | ${row.variant_label.padEnd(10)} | ${row.batch_date} | ${row.initial_quantity.toString().padEnd(7)} | ${row.total_sold.toString().padEnd(6)} | ${row.over_sold_by.toString().padEnd(9)} | ${row.remaining_quantity}`
        );
    }
    
    console.log('-'.repeat(120));
    console.log(`Total over-sold units across all batches: ${totalOverSold}`);
    console.log(`\nNote: "remaining_quantity" was already corrected to 0 (was negative before fix).`);
    console.log(`The "over_sold_by" column shows how many units were sold beyond the batch's capacity.`);
    
} catch (err) {
    console.error('Query failed:', err);
    process.exit(1);
} finally {
    await pool.end();
}
