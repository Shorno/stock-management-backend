// Applies only drizzle/0020_sr_many_companies.sql to DATABASE_URL.
// Production's Drizzle history is incomplete (see apply-migration-0012.ts), so do
// not run the full migration chain or advance its journal past untracked changes.
//
// Lets one SR work for several companies:
// - new sr_brands link table, filled from each SR's current company (sr.brand_id is kept)
// - nullable brand_id on order_expenses and sr_commissions, so a commission records
//   which company it is for
// Existing rows are not changed. Apply after 0018 and 0019.
// NOT YET APPLIED to any database.
//
// Optional: --backfill-commission-company also fills in the company on old commissions
// where it is certain (drizzle/0020_backfill_commission_company.sql). Inspect mode shows
// how many rows it would fill.
//
// Usage:
//   bun run apply-migration-0020.ts                                        # inspect
//   bun run apply-migration-0020.ts --apply                                # apply and verify
//   bun run apply-migration-0020.ts --apply --backfill-commission-company  # also backfill
// Re-running --apply succeeds without changes when everything is present.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const backfill = process.argv.includes('--backfill-commission-company');
const migrationFile = join(import.meta.dir, 'drizzle', '0020_sr_many_companies.sql');
const backfillFile = join(import.meta.dir, 'drizzle', '0020_backfill_commission_company.sql');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
let transactionOpen = false;

const statements = (file: string) =>
    readFileSync(file, 'utf8').split('--> statement-breakpoint').filter((s) => s.replace(/--.*$/gm, '').trim());

async function inspectSchema() {
    const { rows: [state] } = await client.query(`
        SELECT
            to_regclass('public.sr_brands') IS NOT NULL AS has_link_table,
            to_regclass('public.idx_sr_brands_brand') IS NOT NULL AS has_link_index,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_expenses' AND column_name = 'brand_id') AS expenses_brand,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sr_commissions' AND column_name = 'brand_id') AS commissions_brand,
            EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_expenses_brand_id_brand_id_fk') AS expenses_fk,
            EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sr_commissions_brand_id_brand_id_fk') AS commissions_fk
    `);
    const applied = Object.values(state).every(Boolean);
    return { applied, ...state };
}

async function linkCoverage() {
    const { rows: [r] } = await client.query(`
        SELECT (SELECT count(*) FROM sr WHERE brand_id IS NOT NULL)::int AS srs_with_company,
               (SELECT count(*) FROM sr s WHERE s.brand_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM sr_brands l WHERE l.sr_id = s.id AND l.brand_id = s.brand_id))::int AS missing_links
    `);
    return r as { srs_with_company: number; missing_links: number };
}

async function backfillPreview() {
    const { rows: [r] } = await client.query(`
        WITH single_company AS (
            SELECT order_id, sr_id FROM wholesale_order_items WHERE sr_id IS NOT NULL
            GROUP BY order_id, sr_id HAVING count(DISTINCT brand_id) = 1
        )
        SELECT
            (SELECT count(*) FROM order_expenses e JOIN single_company s USING (order_id, sr_id)
               WHERE e.brand_id IS NULL AND e.expense_type = 'commission')::int AS order_expenses,
            (SELECT count(*) FROM sr_commissions c JOIN single_company s USING (order_id, sr_id)
               WHERE c.brand_id IS NULL AND c.order_id IS NOT NULL)::int AS order_commissions,
            (SELECT count(*) FROM sr_commissions c
               WHERE c.brand_id IS NULL AND c.order_id IS NULL
                 AND c.sr_id IN (SELECT sr_id FROM sr_brands GROUP BY sr_id HAVING count(*) = 1))::int AS manual_commissions,
            (SELECT count(*) FROM sr_commissions WHERE brand_id IS NULL)::int AS commissions_without_company
    `);
    return r;
}

try {
    await client.connect();
    const before = await inspectSchema();
    if (!apply) {
        console.log(JSON.stringify(before, null, 2));
        if (before.applied) {
            console.log('Link coverage:', JSON.stringify(await linkCoverage()));
            console.log('--backfill-commission-company would fill:', JSON.stringify(await backfillPreview()));
        }
    } else if (before.applied && !backfill) {
        console.log('Migration 0020 is already applied; no changes made.');
    } else {
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        if (!before.applied) {
            for (const statement of statements(migrationFile)) await client.query(statement);
            const after = await inspectSchema();
            if (!after.applied) throw new Error('Migration 0020 schema verification failed.');
            const coverage = await linkCoverage();
            if (coverage.missing_links !== 0) throw new Error(`${coverage.missing_links} SRs did not get a company link.`);
            console.log(`Migration 0020 applied. ${coverage.srs_with_company} SRs linked to their current company.`);
        }
        if (backfill) {
            const preview = await backfillPreview();
            for (const statement of statements(backfillFile)) await client.query(statement);
            console.log('Backfilled commission company:', JSON.stringify(preview));
        }
        await client.query('COMMIT');
        transactionOpen = false;
        console.log('Done; the historical Drizzle journal was unchanged.');
    }
} catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('Migration 0020 failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
} finally {
    await client.end();
}
