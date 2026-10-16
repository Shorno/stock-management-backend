// Applies only drizzle/0015_difference_history.sql to DATABASE_URL.
// Production's Drizzle history is incomplete (see apply-migration-0012.ts), so do
// not run the full migration chain or advance its journal past untracked changes.
// Adds three nullable snapshot columns to net_asset_ledger. Existing rows stay null
// and no amounts change. Applied to production and verified on 2026-10-16 using this
// script, before the code that reads these columns was merged.
//
// Usage:
//   bun run apply-migration-0015.ts          # inspect the current schema
//   bun run apply-migration-0015.ts --apply  # apply and verify in one transaction
// Re-running --apply succeeds without changes when the exact schema is present.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const migrationFile = join(import.meta.dir, 'drizzle', '0015_difference_history.sql');
const expectedColumns = ['difference_after', 'investment_balance_after', 'profit_after'];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
let transactionOpen = false;

async function inspectSchema() {
    const columns = await client.query(`
        SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'net_asset_ledger' AND column_name = ANY($1)
        ORDER BY column_name
    `, [expectedColumns]);
    const applied = columns.rows.length === expectedColumns.length && columns.rows.every((c) =>
        c.data_type === 'numeric' && Number(c.numeric_precision) === 14 && Number(c.numeric_scale) === 2
        && c.is_nullable === 'YES' && c.column_default === null);
    return { applied, partial: !applied && columns.rows.length > 0, columns: columns.rows };
}

try {
    await client.connect();
    const before = await inspectSchema();
    if (!apply) {
        console.log(JSON.stringify(before, null, 2));
    } else if (before.applied) {
        console.log('Migration 0015 is already applied and verified; no changes made.');
    } else {
        if (before.partial) throw new Error('Migration 0015 has an unexpected partial schema. Inspect before applying.');
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        for (const statement of readFileSync(migrationFile, 'utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await client.query(statement);
        }
        const after = await inspectSchema();
        if (!after.applied) throw new Error('Migration 0015 schema verification failed.');
        await client.query('COMMIT');
        transactionOpen = false;
        console.log('Migration 0015 applied and verified. Existing ledger rows were unchanged; the historical Drizzle journal was unchanged.');
        console.log(JSON.stringify(after, null, 2));
    }
} catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Migration 0015 failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
} finally {
    await client.end();
}
