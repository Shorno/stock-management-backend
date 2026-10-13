// Applies only drizzle/0013_link_stock_batch_purchases.sql to DATABASE_URL.
// Production's Drizzle history is incomplete (see apply-migration-0012.ts), so do
// not run the full migration chain or advance its journal past untracked changes.
// This adds a nullable link, foreign key and index without changing existing rows.
// Applied to production and verified on 2026-10-14 using this script.
//
// Usage:
//   bun run apply-migration-0013.ts          # inspect the current schema
//   bun run apply-migration-0013.ts --apply  # apply and verify in one transaction
// Re-running --apply succeeds without changes when the exact schema is present.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const migrationFile = join(import.meta.dir, 'drizzle', '0013_link_stock_batch_purchases.sql');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
let transactionOpen = false;

async function inspectSchema() {
    const columns = await client.query(`
        SELECT data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'supplier_purchases' AND column_name = 'stock_batch_id'
    `);
    const constraints = await client.query(`
        SELECT pg_get_constraintdef(oid) AS definition, convalidated
        FROM pg_constraint
        WHERE conrelid = 'public.supplier_purchases'::regclass
          AND conname = 'supplier_purchases_stock_batch_id_stock_batch_id_fk'
    `);
    const indexes = await client.query(`
        SELECT pg_get_indexdef(i.indexrelid) AS definition, i.indisvalid
        FROM pg_index i
        WHERE i.indexrelid = to_regclass('public.idx_supplier_purchases_batch')
    `);
    const column = columns.rows[0];
    const constraint = constraints.rows[0];
    const index = indexes.rows[0];
    const applied = column?.data_type === 'integer' && column.is_nullable === 'YES' && column.column_default === null
        && constraint?.definition === 'FOREIGN KEY (stock_batch_id) REFERENCES stock_batch(id) ON DELETE CASCADE'
        && constraint.convalidated === true
        && index?.definition === 'CREATE INDEX idx_supplier_purchases_batch ON public.supplier_purchases USING btree (stock_batch_id)'
        && index.indisvalid === true;
    return { applied: Boolean(applied), partial: !applied && Boolean(column || constraint || index), columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
}

try {
    await client.connect();
    const before = await inspectSchema();
    if (!apply) {
        console.log(JSON.stringify(before, null, 2));
    } else if (before.applied) {
        console.log('Migration 0013 is already applied and verified; no changes made.');
    } else {
        if (before.partial) throw new Error('Migration 0013 has an unexpected partial schema. Inspect before applying.');
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        for (const statement of readFileSync(migrationFile, 'utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await client.query(statement);
        }
        const after = await inspectSchema();
        if (!after.applied) throw new Error('Migration 0013 schema verification failed.');
        await client.query('COMMIT');
        transactionOpen = false;
        console.log('Migration 0013 applied and verified. Existing rows and the historical Drizzle journal were unchanged.');
        console.log(JSON.stringify(after, null, 2));
    }
} catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Migration 0013 failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
} finally {
    await client.end();
}
