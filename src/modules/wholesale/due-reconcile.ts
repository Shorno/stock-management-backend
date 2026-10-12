// Reconciles the dues submitted on an order adjustment against the due rows
// already stored for that order.
//
// Due rows carry collection progress (collected_amount) and are referenced by
// collection records, so an adjustment must update them in place rather than
// delete and re-insert them. Re-inserting resets the collected amount to zero
// and orphans the collection records, which shows the full due again while the
// collected cash is still counted.

export interface ExistingDueRow {
    id: number;
    amount: number;
    collectedAmount: number;
    // Identity that collections are tied to (customer for customer dues, DSR/SR for their dues)
    key: string;
    label: string;
}

export interface IncomingDueEntry {
    dueId?: number;
    amount: number;
    key: string;
    label: string;
}

export interface DueReconcilePlan<TIn extends IncomingDueEntry, TRow extends ExistingDueRow> {
    updates: { row: TRow; entry: TIn }[];
    inserts: TIn[];
    deletes: TRow[];
}

const toCents = (value: number) => Math.round(value * 100);

const formatTaka = (value: number) => `৳${value.toFixed(2)}`;

export const planDueReconciliation = <TIn extends IncomingDueEntry, TRow extends ExistingDueRow>(
    existing: TRow[],
    incoming: TIn[],
    dueKind: string
): DueReconcilePlan<TIn, TRow> => {
    const unclaimed = new Map(existing.map((row) => [row.id, row]));
    const matches = new Map<TIn, TRow>();

    // Pass 1: entries that reference a stored due row by id
    for (const entry of incoming) {
        if (!entry.dueId) continue;
        const row = unclaimed.get(entry.dueId);
        if (!row) continue;
        matches.set(entry, row);
        unclaimed.delete(row.id);
    }

    // Pass 2: entries without a usable id (stale clients, drafts) fall back to the
    // same customer/DSR/SR, preferring the same amount, then rows with collections.
    for (const entry of incoming) {
        if (matches.has(entry)) continue;
        const candidates = [...unclaimed.values()]
            .filter((row) => row.key === entry.key)
            .sort((a, b) => {
                const aSame = toCents(a.amount) === toCents(entry.amount) ? 1 : 0;
                const bSame = toCents(b.amount) === toCents(entry.amount) ? 1 : 0;
                if (aSame !== bSame) return bSame - aSame;
                if (toCents(a.collectedAmount) !== toCents(b.collectedAmount)) {
                    return toCents(b.collectedAmount) - toCents(a.collectedAmount);
                }
                return a.id - b.id;
            });
        const row = candidates[0];
        if (!row) continue;
        matches.set(entry, row);
        unclaimed.delete(row.id);
    }

    const plan: DueReconcilePlan<TIn, TRow> = { updates: [], inserts: [], deletes: [] };

    for (const entry of incoming) {
        const row = matches.get(entry);
        if (!row) {
            plan.inserts.push(entry);
            continue;
        }

        if (toCents(row.collectedAmount) > 0) {
            if (row.key !== entry.key) {
                throw new Error(
                    `${dueKind} for ${row.label} already has ${formatTaka(row.collectedAmount)} collected, ` +
                    `so it cannot be moved to ${entry.label}. Change only the amount, or add a new due instead.`
                );
            }
            if (toCents(entry.amount) < toCents(row.collectedAmount)) {
                throw new Error(
                    `${dueKind} for ${row.label} cannot be less than ${formatTaka(row.collectedAmount)} ` +
                    `because that amount has already been collected.`
                );
            }
        }

        plan.updates.push({ row, entry });
    }

    for (const row of unclaimed.values()) {
        if (toCents(row.collectedAmount) > 0) {
            throw new Error(
                `${dueKind} for ${row.label} cannot be removed because ${formatTaka(row.collectedAmount)} ` +
                `has already been collected against it.`
            );
        }
        plan.deletes.push(row);
    }

    return plan;
};
