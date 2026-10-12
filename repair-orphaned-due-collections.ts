// One-off repair for dues reset by editing an order adjustment.
//
// Before the fix, saving an adjustment deleted and re-inserted every due row for
// the order. The new rows started with collected_amount = 0 and the existing
// collection records lost their link (FK set null), so the full due showed again
// while the collected cash was still counted.
//
// This script re-links those orphaned collections to the order's current due row
// for the same customer/DSR/SR and recomputes collected_amount from the linked
// collections. A collection is left untouched (and reported) when the order no
// longer has a matching due or linking it would push the due over its amount.
//
// Usage:
//   bun run repair-orphaned-due-collections.ts           # dry run, rolls back
//   bun run repair-orphaned-due-collections.ts --apply   # commits the repair
import 'dotenv/config';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');

interface DueKind {
    name: string;
    collectionTable: string;
    collectionDueFk: string;
    ownerColumn: string;
    dueTable: string;
    ownerName: string; // SQL for the owner's display name, joined as "o"
    ownerJoin: string;
}

const KINDS: DueKind[] = [
    {
        name: 'Customer dues',
        collectionTable: 'due_collections',
        collectionDueFk: 'customer_due_id',
        ownerColumn: 'customer_id',
        dueTable: 'order_customer_dues',
        ownerName: 'o.name',
        ownerJoin: 'LEFT JOIN customer o ON o.id = c.customer_id',
    },
    {
        name: 'DSR dues',
        collectionTable: 'dsr_due_collections',
        collectionDueFk: 'dsr_due_id',
        ownerColumn: 'dsr_id',
        dueTable: 'order_dsr_dues',
        ownerName: 'o.name',
        ownerJoin: 'LEFT JOIN dsr o ON o.id = c.dsr_id',
    },
    {
        name: 'SR dues',
        collectionTable: 'sr_due_collections',
        collectionDueFk: 'sr_due_id',
        ownerColumn: 'sr_id',
        dueTable: 'order_sr_dues',
        ownerName: 'o.name',
        ownerJoin: 'LEFT JOIN sr o ON o.id = c.sr_id',
    },
];

const cents = (value: string | number) => Math.round(Number(value) * 100);
const taka = (valueInCents: number) => `৳${(valueInCents / 100).toFixed(2)}`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

let totalLinked = 0;
let totalSkipped = 0;

try {
    await client.query('BEGIN');
    console.log(APPLY ? '=== APPLY MODE: changes will be committed ===' : '=== DRY RUN: no changes will be saved ===');

    for (const kind of KINDS) {
        console.log(`\n## ${kind.name}`);

        const orphans = await client.query(
            `SELECT c.id, c.order_id, c.${kind.ownerColumn} AS owner_id, c.amount, c.collection_date::text AS collection_date,
                    w.order_number, ${kind.ownerName} AS owner_name
               FROM ${kind.collectionTable} c
               JOIN wholesale_orders w ON w.id = c.order_id
               ${kind.ownerJoin}
              WHERE c.${kind.collectionDueFk} IS NULL AND c.order_id IS NOT NULL
              ORDER BY c.order_id, c.collection_date, c.id
              FOR UPDATE OF c`
        );

        if (orphans.rows.length === 0) {
            console.log('No orphaned collections.');
            continue;
        }

        // Current due rows for the affected orders, with what is already linked to them
        const orderIds = [...new Set(orphans.rows.map((r) => r.order_id))];
        const dues = await client.query(
            `SELECT d.id, d.order_id, d.${kind.ownerColumn} AS owner_id, d.amount, d.collected_amount,
                    COALESCE((SELECT SUM(c.amount) FROM ${kind.collectionTable} c WHERE c.${kind.collectionDueFk} = d.id), 0) AS linked
               FROM ${kind.dueTable} d
              WHERE d.order_id = ANY($1)
              ORDER BY d.id
              FOR UPDATE OF d`,
            [orderIds]
        );

        const dueState = dues.rows.map((d) => ({
            id: d.id as number,
            orderId: d.order_id as number,
            ownerId: d.owner_id as number | null,
            amount: cents(d.amount),
            storedCollected: cents(d.collected_amount),
            linked: cents(d.linked),
            relinked: [] as number[],
        }));

        for (const orphan of orphans.rows) {
            const amount = cents(orphan.amount);
            const where = `${orphan.order_number} / ${orphan.owner_name ?? `#${orphan.owner_id}`}`;
            const candidates = dueState.filter((d) => d.orderId === orphan.order_id && d.ownerId === orphan.owner_id);
            const target = candidates.find((d) => d.amount - d.linked >= amount);

            if (!target) {
                totalSkipped++;
                const reason = candidates.length === 0
                    ? 'order no longer has a due for this owner'
                    : `would exceed the due (remaining room ${taka(Math.max(...candidates.map((d) => d.amount - d.linked)))})`;
                console.log(`  SKIP  collection #${orphan.id} ${taka(amount)} on ${orphan.collection_date} [${where}]: ${reason}`);
                continue;
            }

            await client.query(
                `UPDATE ${kind.collectionTable} SET ${kind.collectionDueFk} = $1 WHERE id = $2`,
                [target.id, orphan.id]
            );
            target.linked += amount;
            target.relinked.push(orphan.id);
            totalLinked++;
            console.log(`  LINK  collection #${orphan.id} ${taka(amount)} [${where}] -> due #${target.id}`);
        }

        for (const due of dueState.filter((d) => d.relinked.length > 0)) {
            await client.query(
                `UPDATE ${kind.dueTable} SET collected_amount = $1 WHERE id = $2`,
                [(due.linked / 100).toFixed(2), due.id]
            );
            console.log(
                `  FIX   due #${due.id}: amount ${taka(due.amount)}, collected ${taka(due.storedCollected)} -> ${taka(due.linked)}, ` +
                `remaining ${taka(due.amount - due.storedCollected)} -> ${taka(due.amount - due.linked)}`
            );
        }
    }

    console.log(`\nLinked ${totalLinked} collection(s); ${totalSkipped} left for manual review.`);

    if (APPLY) {
        await client.query('COMMIT');
        console.log('Committed.');
    } else {
        await client.query('ROLLBACK');
        console.log('Rolled back (dry run). Re-run with --apply to save.');
    }
} catch (err) {
    await client.query('ROLLBACK');
    console.error('Repair failed, nothing was changed:', err);
    process.exitCode = 1;
} finally {
    client.release();
    await pool.end();
}
