// Applies only drizzle/0018_hide_companies_srs.sql to DATABASE_URL.
// Production's Drizzle history is incomplete (see apply-migration-0012.ts), so do
// not run the full migration chain or advance its journal past untracked changes.
// Adds is_active (boolean, default true, not null) to "brand" and "sr" so companies
// and SRs can be hidden and shown again. Every existing row becomes active, so nothing
// changes for users until someone hides a company or SR. No rows are deleted.
// NOT YET APPLIED to any database.
//
// Usage:
//   bun run apply-migration-0018.ts          # inspect the current schema
//   bun run apply-migration-0018.ts --apply  # apply and verify in one transaction
// Re-running --apply succeeds without changes when the columns are present.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const migrationFile = join(import.meta.dir, 'drizzle', '0018_hide_companies_srs.sql');
const expectedColumns = [
    { table: 'brand', column: 'is_active' },
    { table: 'sr', column: 'is_active' },
];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
let transactionOpen = false;

async function inspectSchema() {
    const result = await client.query(`
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'is_active' AND table_name = ANY($1)
        ORDER BY table_name
    `, [expectedColumns.map((c) => c.table)]);
    const found = result.rows as { table_name: string; data_type: string; is_nullable: string; column_default: string | null }[];
    const valid = found.filter((r) => r.data_type === 'boolean' && r.is_nullable === 'NO' && r.column_default === 'true');
    const applied = valid.length === expectedColumns.length;
    return { applied, partial: !applied && found.length > 0, columns: found };
}

try {
    await client.connect();
    const before = await inspectSchema();
    if (!apply) {
        console.log(JSON.stringify(before, null, 2));
    } else if (before.applied) {
        console.log('Migration 0018 is already applied; no changes made.');
    } else {
        if (before.partial) throw new Error('Migration 0018 has an unexpected partial schema. Inspect before applying.');
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        for (const statement of readFileSync(migrationFile, 'utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await client.query(statement);
        }
        const after = await inspectSchema();
        if (!after.applied) throw new Error('Migration 0018 schema verification failed.');
        const hidden = await client.query(`
            SELECT (SELECT count(*) FROM brand WHERE NOT is_active)::int AS brands,
                   (SELECT count(*) FROM sr WHERE NOT is_active)::int AS srs
        `);
        if (hidden.rows[0].brands !== 0 || hidden.rows[0].srs !== 0) throw new Error('Existing rows were not all left active.');
        await client.query('COMMIT');
        transactionOpen = false;
        console.log('Migration 0018 applied and verified. All existing companies and SRs are active; the historical Drizzle journal was unchanged.');
        console.log(JSON.stringify(after, null, 2));
    }
} catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Migration 0018 failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
} finally {
    await client.end();
}
