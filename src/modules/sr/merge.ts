import { db } from "../../db/config";
import {
  sr,
  srBrands,
  srDocuments,
  wholesaleOrderItems,
  orderExpenses,
  orderDamageItems,
  orderSrDues,
  srDueCollections,
  srCommissions,
  openingBalances,
} from "../../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { SrInputError } from "./service";

/**
 * Merging duplicate SRs.
 *
 * The same person was often added once per company ("Shawon" for ACI and again for
 * BD Food). Merging moves everything recorded under the duplicates onto the SR being
 * kept, gives that SR all of their companies, and deletes the duplicates.
 *
 * History stays correct because every order line, expense, damage item, due, collection
 * and commission keeps its own company; only the SR it points to changes.
 */

const PROFILE_FIELDS = ["phone", "address", "nidNumber", "emergencyContact", "notes", "profilePhoto"] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

export interface MergeSrsResult {
  kept: { id: number; name: string };
  merged: { id: number; name: string }[];
  /** Rows moved from the duplicates to the kept SR, per kind. */
  moved: {
    orderLines: number;
    orderExpenses: number;
    damageItems: number;
    srDues: number;
    dueCollections: number;
    commissions: number;
    documents: number;
  };
  /** Companies the kept SR works for after the merge. */
  companyIds: number[];
  /** Companies the kept SR did not have before. */
  addedCompanyIds: number[];
  /** Profile fields that were empty on the kept SR and were filled from a duplicate. */
  filledProfileFields: ProfileField[];
  /** Opening SR due after the merge (duplicates' opening dues are added to the kept SR's). */
  openingDue: { before: number; after: number } | null;
}

/** Thrown inside a preview so the transaction rolls back after the counts are taken. */
class PreviewRollback extends Error {
  constructor(public result: MergeSrsResult) {
    super("preview");
  }
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * Merges `sourceIds` into `targetId`. With `preview`, does all the work and reports what
 * would happen, then rolls back, so the preview always matches the real merge.
 */
export async function mergeSrs(targetId: number, sourceIds: number[], { preview = false } = {}): Promise<MergeSrsResult> {
  const sources = [...new Set(sourceIds)];
  if (sources.length === 0) throw new SrInputError("Choose at least one SR to merge");
  if (sources.includes(targetId)) throw new SrInputError("An SR cannot be merged into itself");

  try {
    return await db.transaction(async (tx) => {
      // Lock all SRs involved so nothing is written against them mid-merge.
      const rows = await tx.select().from(sr).where(inArray(sr.id, [targetId, ...sources])).for("update");
      const target = rows.find((r) => r.id === targetId);
      if (!target) throw new SrInputError("The SR to keep was not found");
      const sourceRows = sources.map((id) => rows.find((r) => r.id === id));
      const missing = sources.filter((_, i) => !sourceRows[i]);
      if (missing.length) throw new SrInputError(`SR not found: #${missing.join(", #")}`);
      const dupes = sourceRows as NonNullable<(typeof sourceRows)[number]>[];

      // ---- Companies: the kept SR works for all of them ----
      const links = await tx.select().from(srBrands).where(inArray(srBrands.srId, [targetId, ...sources]));
      const before = links.filter((l) => l.srId === targetId).map((l) => l.brandId);
      const companyIds = [...before];
      // Keep the duplicates' own order (their main company first) for anything new.
      for (const dupe of dupes) {
        const own = links.filter((l) => l.srId === dupe.id).map((l) => l.brandId);
        const ordered = dupe.brandId != null && own.includes(dupe.brandId) ? [dupe.brandId, ...own.filter((b) => b !== dupe.brandId)] : own;
        for (const b of ordered) if (!companyIds.includes(b)) companyIds.push(b);
      }
      const addedCompanyIds = companyIds.filter((b) => !before.includes(b));
      if (addedCompanyIds.length) {
        await tx.insert(srBrands).values(addedCompanyIds.map((brandId) => ({ srId: targetId, brandId }))).onConflictDoNothing();
      }

      // ---- Move every record to the kept SR ----
      const move = async (table: typeof wholesaleOrderItems | typeof orderExpenses | typeof orderDamageItems | typeof orderSrDues | typeof srDueCollections | typeof srCommissions | typeof srDocuments) => {
        const updated = await tx
          .update(table)
          .set({ srId: targetId } as never)
          .where(inArray(table.srId, sources))
          .returning({ id: table.id });
        return updated.length;
      };
      const moved = {
        orderLines: await move(wholesaleOrderItems),
        orderExpenses: await move(orderExpenses),
        damageItems: await move(orderDamageItems),
        srDues: await move(orderSrDues),
        dueCollections: await move(srDueCollections),
        commissions: await move(srCommissions),
        documents: await move(srDocuments),
      };

      // ---- Opening SR due: one per SR, so add the duplicates' to the kept SR's ----
      const opening = await tx
        .select()
        .from(openingBalances)
        .where(and(eq(openingBalances.type, "sr_due"), inArray(openingBalances.entityId, [targetId, ...sources])));
      let openingDue: MergeSrsResult["openingDue"] = null;
      const dupeOpening = opening.filter((o) => o.entityId !== targetId);
      if (dupeOpening.length) {
        const keptOpening = opening.find((o) => o.entityId === targetId);
        const beforeAmount = keptOpening ? parseFloat(keptOpening.amount) : 0;
        const total = opening.reduce((sum, o) => sum + parseFloat(o.amount), 0);
        const earliest = opening.map((o) => o.balanceDate).sort()[0]!;
        const notes = opening.map((o) => o.note?.trim()).filter(Boolean).join(" | ") || null;
        const base = keptOpening ?? dupeOpening[0]!;
        const others = opening.filter((o) => o.id !== base.id).map((o) => o.id);
        if (others.length) await tx.delete(openingBalances).where(inArray(openingBalances.id, others));
        await tx
          .update(openingBalances)
          .set({ entityId: targetId, entityName: target.name, amount: total.toFixed(2), balanceDate: earliest, note: notes })
          .where(eq(openingBalances.id, base.id));
        openingDue = { before: beforeAmount, after: Math.round(total * 100) / 100 };
      }

      // ---- Profile: keep the kept SR's details, fill only the empty ones ----
      const fill: Partial<Record<ProfileField, string>> = {};
      for (const field of PROFILE_FIELDS) {
        if (!blank(target[field])) continue;
        const from = dupes.find((d) => !blank(d[field]));
        if (from) fill[field] = from[field] as string;
      }
      const filledProfileFields = Object.keys(fill) as ProfileField[];

      await tx
        .update(sr)
        .set({
          ...fill,
          // Older readers look at sr.brand_id; keep the kept SR's main company if it has one.
          brandId: target.brandId != null && companyIds.includes(target.brandId) ? target.brandId : companyIds[0] ?? null,
        })
        .where(eq(sr.id, targetId));

      // Everything has moved off the duplicates; their own company links go with them.
      await tx.delete(sr).where(inArray(sr.id, sources));

      const result: MergeSrsResult = {
        kept: { id: target.id, name: target.name },
        merged: dupes.map((d) => ({ id: d.id, name: d.name })),
        moved,
        companyIds,
        addedCompanyIds,
        filledProfileFields,
        openingDue,
      };
      if (preview) throw new PreviewRollback(result);
      return result;
    });
  } catch (error) {
    if (error instanceof PreviewRollback) return error.result;
    throw error;
  }
}
