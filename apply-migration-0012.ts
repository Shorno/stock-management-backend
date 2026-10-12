// Applies drizzle/0012_restrict_collected_due_deletes.sql directly to the database.
//
// Applied to production on 2026-10-13 with this script (not drizzle-kit). Production's
// drizzle.__drizzle_migrations table only tracks the first 4 migrations, so
// `drizzle-kit migrate` would try to re-run 0004-0011, and `drizzle-kit push` would
// apply every other schema difference it finds. Running the SQL directly changes only
// these three foreign keys. Note that 0012 is therefore not recorded in
// drizzle.__drizzle_migrations.
//
// The migration makes due collections block deletion of the due they belong to
// (ON DELETE RESTRICT instead of SET NULL), so collected money can never be detached
// from its due by an edit, an order delete, or an SR delete.
//
// The statements are idempotent (DROP IF EXISTS + ADD), so re-running is safe.
// Usage:
//   bun run apply-migration-0012.ts           # show the current constraint definitions only
//   bun run apply-migration-0012.ts --apply   # apply the migration in one transaction
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const MIGRATION_FILE = join(import.meta.dir, 'drizzle', '0012_restrict_collected_due_deletes.sql');
const CONSTRAINTS = [
    'due_collections_customer_due_id_order_customer_dues_id_fk',
    'dsr_due_collections_dsr_due_id_order_dsr_dues_id_fk',
    'sr_due_collections_sr_due_id_order_sr_dues_id_fk',
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const showConstraints = async () => {
    const { rows } = await client.query(
        `SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conname = ANY($1)
          ORDER BY 1`,
        [CONSTRAINTS]
    );
    console.table(rows);
};

try {
    if (!APPLY) {
        console.log('Current constraints (re-run with --apply to apply the migration):');
        await showConstraints();
    } else {
        const sql = readFileSync(MIGRATION_FILE, 'utf8');
        await client.query('BEGIN');
        for (const statement of sql.split('--> statement-breakpoint')) {
            if (statement.trim()) await client.query(statement);
        }
        await client.query('COMMIT');
        console.log('Migration 0012 applied. Constraints now:');
        await showConstraints();
    }
} catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    console.error('Migration failed, nothing was changed:', err);
    process.exitCode = 1;
} finally {
    client.release();
    await pool.end();
}
