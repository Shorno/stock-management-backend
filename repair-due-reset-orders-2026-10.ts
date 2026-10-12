// One-off repair (Oct 2026) for two orders damaged by the "edit adjustment resets
// collected dues" bug. Decisions were confirmed with the business owner:
//
// WO-2026-0650 (order 661): restore the original dues and drop the workaround
//   Transport expenses the client added to rebalance the settlement.
//     - Shyamoli Pharmacy due #488: ৳3,000 -> ৳6,065, collected ৳3,065 (collection #584)
//     - New Brothers: re-create ৳2,561 due, fully collected (collection #585)
//     - delete Transport expenses #898 (৳2,561) and #899 (৳3,065)
// WO-2026-0214 (order 220): the dues were collected twice after a re-save reset them.
//     - delete duplicate collections #239 (৳1,260, Jul 6) and #382 (৳345, Aug 23)
//     - re-link the original collections #137, #138 -> due #203 and #146 -> due #204
//
// WO-2026-0269 is intentionally left for the client to review.
//
// Every row is checked against the state inspected before the fix; any mismatch
// aborts without changes. Usage:
//   bun run repair-due-reset-orders-2026-10.ts           # dry run, rolls back
//   bun run repair-due-reset-orders-2026-10.ts --apply   # commits
import 'dotenv/config';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const REPAIR_USER = 'System (due reset data repair)';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const expectRow = async (label: string, sql: string, params: unknown[], expected: Record<string, unknown>) => {
    const { rows } = await client.query(sql, params);
    if (rows.length !== 1) throw new Error(`${label}: expected 1 row, found ${rows.length}`);
    const row = rows[0];
    for (const [key, value] of Object.entries(expected)) {
        if (String(row[key]) !== String(value)) {
            throw new Error(`${label}: expected ${key}=${value}, found ${row[key]}`);
        }
    }
    return row;
};

const audit = (action: string, orderId: number, orderNumber: string, oldValue: unknown, newValue: unknown) =>
    client.query(
        `INSERT INTO audit_logs (user_name, user_role, action, entity_type, entity_id, entity_name, old_value, new_value, metadata)
         VALUES ($1, 'system', $2, 'wholesale_order', $3, $4, $5, $6, $7)`,
        [
            REPAIR_USER, action, String(orderId), orderNumber,
            JSON.stringify(oldValue), JSON.stringify(newValue),
            JSON.stringify({ reason: 'Repair of dues reset by editing an adjusted order (collected amounts were lost)' }),
        ]
    );

try {
    await client.query('BEGIN');
    console.log(APPLY ? '=== APPLY MODE: changes will be committed ===' : '=== DRY RUN: no changes will be saved ===');

    // ---------------- WO-2026-0650 ----------------
    console.log('\n## WO-2026-0650 (order 661)');
    await expectRow('order 661', `SELECT order_number FROM wholesale_orders WHERE id = 661 FOR UPDATE`, [], { order_number: 'WO-2026-0650' });
    await expectRow('due #488',
        `SELECT order_id, customer_id, amount, collected_amount FROM order_customer_dues WHERE id = 488 FOR UPDATE`, [],
        { order_id: 661, customer_id: 258, amount: '3000.00', collected_amount: '0.00' });
    await expectRow('collection #584',
        `SELECT order_id, customer_id, customer_due_id, amount FROM due_collections WHERE id = 584 FOR UPDATE`, [],
        { order_id: 661, customer_id: 258, customer_due_id: null, amount: '3065.00' });
    await expectRow('collection #585',
        `SELECT order_id, customer_id, customer_due_id, amount FROM due_collections WHERE id = 585 FOR UPDATE`, [],
        { order_id: 661, customer_id: 122, customer_due_id: null, amount: '2561.00' });
    for (const [id, amount] of [[898, '2561.00'], [899, '3065.00']] as const) {
        await expectRow(`expense #${id}`,
            `SELECT order_id, amount, expense_type, sr_id FROM order_expenses WHERE id = $1 FOR UPDATE`, [id],
            { order_id: 661, amount, expense_type: 'transport', sr_id: null });
    }
    const { rows: linkedCommissions } = await client.query(
        `SELECT id FROM sr_commissions WHERE order_expense_id IN (898, 899)`);
    if (linkedCommissions.length) throw new Error('expenses #898/#899 unexpectedly have SR commissions');
    const newBrothers = await expectRow('customer #122', `SELECT name FROM customer WHERE id = 122`, [], {});

    await client.query(`UPDATE order_customer_dues SET amount = '6065.00', collected_amount = '3065.00' WHERE id = 488`);
    await client.query(`UPDATE due_collections SET customer_due_id = 488 WHERE id = 584`);
    const { rows: [newDue] } = await client.query(
        `INSERT INTO order_customer_dues (order_id, customer_id, customer_name, amount, collected_amount, entry_source)
         VALUES (661, 122, $1, '2561.00', '2561.00', 'customer_due') RETURNING id`,
        [newBrothers.name]);
    await client.query(`UPDATE due_collections SET customer_due_id = $1 WHERE id = 585`, [newDue.id]);
    await client.query(`DELETE FROM order_expenses WHERE id IN (898, 899)`);
    await audit('UPDATE', 661, 'WO-2026-0650',
        {
            customerDues: [{ id: 488, customer: 'Shyamoli Pharmacy', amount: 3000, collected: 0 }],
            expenses: [{ id: 898, type: 'transport', amount: 2561 }, { id: 899, type: 'transport', amount: 3065 }],
            orphanedCollections: [584, 585],
        },
        {
            customerDues: [
                { id: 488, customer: 'Shyamoli Pharmacy', amount: 6065, collected: 3065, collectionIds: [584] },
                { id: newDue.id, customer: newBrothers.name, amount: 2561, collected: 2561, collectionIds: [585] },
            ],
            expensesRemoved: [898, 899],
        });
    console.log(`  due #488 -> ৳6,065 (৳3,065 collected, ৳3,000 remaining); collection #584 linked`);
    console.log(`  new due #${newDue.id} for ${newBrothers.name} ৳2,561 fully collected; collection #585 linked`);
    console.log('  deleted workaround Transport expenses #898 (৳2,561) and #899 (৳3,065)');

    // ---------------- WO-2026-0214 ----------------
    console.log('\n## WO-2026-0214 (order 220)');
    await expectRow('order 220', `SELECT order_number FROM wholesale_orders WHERE id = 220 FOR UPDATE`, [], { order_number: 'WO-2026-0214' });
    await expectRow('due #203', `SELECT order_id, customer_id, amount, collected_amount FROM order_customer_dues WHERE id = 203 FOR UPDATE`, [],
        { order_id: 220, customer_id: 247, amount: '1260.00', collected_amount: '1260.00' });
    await expectRow('due #204', `SELECT order_id, customer_id, amount, collected_amount FROM order_customer_dues WHERE id = 204 FOR UPDATE`, [],
        { order_id: 220, customer_id: 249, amount: '345.00', collected_amount: '345.00' });
    const duplicates = [];
    for (const [id, dueId, customerId, amount, date] of [
        [239, 203, 247, '1260.00', '2026-07-06'],
        [382, 204, 249, '345.00', '2026-08-23'],
    ] as const) {
        duplicates.push(await expectRow(`duplicate collection #${id}`,
            `SELECT id, order_id, customer_due_id, customer_id, amount, collection_date::text AS collection_date, payment_method, collected_by_dsr_id, note
               FROM due_collections WHERE id = $1 FOR UPDATE`, [id],
            { order_id: 220, customer_due_id: dueId, customer_id: customerId, amount, collection_date: date }));
    }
    for (const [id, customerId, amount] of [[137, 247, '1090.00'], [138, 247, '170.00'], [146, 249, '345.00']] as const) {
        await expectRow(`original collection #${id}`,
            `SELECT order_id, customer_due_id, customer_id, amount FROM due_collections WHERE id = $1 FOR UPDATE`, [id],
            { order_id: 220, customer_due_id: null, customer_id: customerId, amount });
    }

    await client.query(`DELETE FROM due_collections WHERE id IN (239, 382)`);
    await client.query(`UPDATE due_collections SET customer_due_id = 203 WHERE id IN (137, 138)`);
    await client.query(`UPDATE due_collections SET customer_due_id = 204 WHERE id = 146`);
    await audit('DELETE', 220, 'WO-2026-0214',
        { duplicateCollections: duplicates },
        { relinked: { 203: [137, 138], 204: [146] }, deletedCollections: [239, 382], dueCollectedAmountsUnchanged: { 203: 1260, 204: 345 } });
    console.log('  deleted duplicate collections #239 (৳1,260, 2026-07-06) and #382 (৳345, 2026-08-23)');
    console.log('  re-linked original collections #137, #138 -> due #203 and #146 -> due #204 (dues stay fully paid)');

    if (APPLY) {
        await client.query('COMMIT');
        console.log('\nCommitted.');
    } else {
        await client.query('ROLLBACK');
        console.log('\nRolled back (dry run). Re-run with --apply to save.');
    }
} catch (err) {
    await client.query('ROLLBACK');
    console.error('\nRepair aborted, nothing was changed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
} finally {
    client.release();
    await pool.end();
}
