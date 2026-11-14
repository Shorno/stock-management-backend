// Applies only drizzle/0019_sr_profile.sql to DATABASE_URL.
// Production's Drizzle history is incomplete (see apply-migration-0012.ts), so do
// not run the full migration chain or advance its journal past untracked changes.
// Adds SR profile columns (phone, address, nid_number, emergency_contact, notes,
// profile_photo; all nullable) and the sr_documents table. Existing SRs keep empty
// profiles. No rows are changed or deleted. Apply after 0018.
// NOT YET APPLIED to any database.
//
// Usage:
//   bun run apply-migration-0019.ts          # inspect the current schema
//   bun run apply-migration-0019.ts --apply  # apply and verify in one transaction
// Re-running --apply succeeds without changes when everything is present.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const migrationFile = join(import.meta.dir, 'drizzle', '0019_sr_profile.sql');
const profileColumns = ['phone', 'address', 'nid_number', 'emergency_contact', 'notes', 'profile_photo'];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
let transactionOpen = false;

async function inspectSchema() {
    const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sr' AND column_name = ANY($1)
        ORDER BY column_name
    `, [profileColumns]);
    const table = await client.query(`
        SELECT
            to_regclass('public.sr_documents') IS NOT NULL AS has_table,
            to_regclass('public.idx_sr_documents_sr') IS NOT NULL AS has_index,
            EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sr_documents_sr_id_sr_id_fk') AS has_fk
    `);
    const { has_table, has_index, has_fk } = table.rows[0];
    const found = columns.rows as { column_name: string; is_nullable: string }[];
    const columnsOk = found.length === profileColumns.length && found.every((c) => c.is_nullable === 'YES');
    const applied = columnsOk && has_table && has_index && has_fk;
    const partial = !applied && (found.length > 0 || has_table);
    return { applied, partial, columns: found, sr_documents: { has_table, has_index, has_fk } };
}

try {
    await client.connect();
    const before = await inspectSchema();
    if (!apply) {
        console.log(JSON.stringify(before, null, 2));
    } else if (before.applied) {
        console.log('Migration 0019 is already applied; no changes made.');
    } else {
        if (before.partial) console.log('Some 0019 objects already exist; the IF NOT EXISTS statements will add the rest.');
        const srCount = (await client.query('SELECT count(*)::int AS n FROM sr')).rows[0].n;
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        for (const statement of readFileSync(migrationFile, 'utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await client.query(statement);
        }
        const after = await inspectSchema();
        if (!after.applied) throw new Error('Migration 0019 schema verification failed.');
        const srCountAfter = (await client.query('SELECT count(*)::int AS n FROM sr')).rows[0].n;
        if (srCountAfter !== srCount) throw new Error('SR row count changed during the migration.');
        await client.query('COMMIT');
        transactionOpen = false;
        console.log(`Migration 0019 applied and verified. ${srCount} SRs unchanged; the historical Drizzle journal was unchanged.`);
        console.log(JSON.stringify(after, null, 2));
    }
} catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Migration 0019 failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
} finally {
    await client.end();
}
