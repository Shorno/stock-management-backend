// Applies only drizzle/0014_pl_adjustment_net_assets.sql to DATABASE_URL.
// Production's Drizzle history is incomplete (see apply-migration-0012.ts), so do
// not run the full migration chain or advance its journal past untracked changes.
// Every existing P&L adjustment is marked profit-only (false); adjustments created
// afterwards default to true and count in net assets. No amounts are changed.
// Applied to production and verified on 2026-10-14 using this script (57 existing
// adjustments marked profit-only). The code that reads the column was deployed first,
// which broke every P&L adjustment query until this ran: apply before deploying.
//
// Usage:
//   bun run apply-migration-0014.ts          # inspect the current schema
//   bun run apply-migration-0014.ts --apply  # apply and verify in one transaction
// Re-running --apply succeeds without changes when the exact schema is present.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const migrationFile = join(import.meta.dir, 'drizzle', '0014_pl_adjustment_net_assets.sql');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
let transactionOpen = false;

async function inspectSchema() {
    const columns = await client.query(`
        SELECT data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pl_adjustments' AND column_name = 'affects_net_assets'
    `);
    const column = columns.rows[0];
    const applied = column?.data_type === 'boolean' && column.is_nullable === 'NO' && column.column_default === 'true';
    return { applied: Boolean(applied), partial: !applied && Boolean(column), columns: columns.rows };
}

try {
    await client.connect();
    const before = await inspectSchema();
    if (!apply) {
        console.log(JSON.stringify(before, null, 2));
    } else if (before.applied) {
        console.log('Migration 0014 is already applied and verified; no changes made.');
    } else {
        if (before.partial) throw new Error('Migration 0014 has an unexpected partial schema. Inspect before applying.');
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        for (const statement of readFileSync(migrationFile, 'utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await client.query(statement);
        }
        const after = await inspectSchema();
        if (!after.applied) throw new Error('Migration 0014 schema verification failed.');
        const counts = await client.query(`
            SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE affects_net_assets)::int AS affecting
            FROM pl_adjustments
        `);
        if (counts.rows[0].affecting !== 0) throw new Error('Migration 0014 marked existing adjustments as affecting net assets.');
        await client.query('COMMIT');
        transactionOpen = false;
        console.log(`Migration 0014 applied and verified. ${counts.rows[0].total} existing adjustment(s) stay profit-only; the historical Drizzle journal was unchanged.`);
        console.log(JSON.stringify(after, null, 2));
    }
} catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Migration 0014 failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
} finally {
    await client.end();
}
