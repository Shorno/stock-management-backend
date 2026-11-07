// Applies only drizzle/0016_sms_notifications.sql to DATABASE_URL.
// Production's Drizzle history is incomplete (see apply-migration-0012.ts), so do
// not run the full migration chain or advance its journal past untracked changes.
// Creates three new tables (sms_settings, sms_templates, sms_logs). No existing
// table or row is changed. SMS stays off until enabled in the app's SMS Settings.
// Applied to production and verified on 2026-11-07 using this script, before the
// code that uses these tables was deployed (existing row counts unchanged).
//
// Usage:
//   bun run apply-migration-0016.ts          # inspect the current schema
//   bun run apply-migration-0016.ts --apply  # apply and verify in one transaction
// Re-running --apply succeeds without changes when the tables are present.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const migrationFile = join(import.meta.dir, 'drizzle', '0016_sms_notifications.sql');
const expectedTables = ['sms_logs', 'sms_settings', 'sms_templates'];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
let transactionOpen = false;

async function inspectSchema() {
    const tables = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)
        ORDER BY table_name
    `, [expectedTables]);
    const found = tables.rows.map((r) => r.table_name as string);
    const applied = found.length === expectedTables.length;
    return { applied, partial: !applied && found.length > 0, tables: found };
}

try {
    await client.connect();
    const before = await inspectSchema();
    if (!apply) {
        console.log(JSON.stringify(before, null, 2));
    } else if (before.applied) {
        console.log('Migration 0016 is already applied; no changes made.');
    } else {
        if (before.partial) throw new Error('Migration 0016 has an unexpected partial schema. Inspect before applying.');
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        for (const statement of readFileSync(migrationFile, 'utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await client.query(statement);
        }
        const after = await inspectSchema();
        if (!after.applied) throw new Error('Migration 0016 schema verification failed.');
        await client.query('COMMIT');
        transactionOpen = false;
        console.log('Migration 0016 applied and verified. No existing tables were changed; the historical Drizzle journal was unchanged.');
        console.log(JSON.stringify(after, null, 2));
    }
} catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Migration 0016 failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
} finally {
    await client.end();
}
