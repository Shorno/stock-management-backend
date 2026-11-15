import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/config";
import { brand, sr, srBrands } from "../../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Line = { srId?: number | null; brandId: number };

const pairKey = (srId: number, brandId: number) => `${srId}:${brandId}`;

/**
 * Every order line with an SR must use an SR who works for that line's company.
 * Pairs already on the order (`keep`) are always allowed, so an old order still saves
 * after an SR stops working for a company.
 */
export async function assertSrsWorkForCompanies(tx: Tx, lines: Line[], keep: Line[] = []): Promise<void> {
    const kept = new Set(keep.filter((l) => l.srId).map((l) => pairKey(l.srId!, l.brandId)));
    const toCheck = new Map<string, { srId: number; brandId: number }>();
    for (const line of lines) {
        if (!line.srId) continue;
        const key = pairKey(line.srId, line.brandId);
        if (!kept.has(key)) toCheck.set(key, { srId: line.srId, brandId: line.brandId });
    }
    if (toCheck.size === 0) return;

    const srIds = [...new Set([...toCheck.values()].map((p) => p.srId))];
    const links = await tx
        .select({ srId: srBrands.srId, brandId: srBrands.brandId })
        .from(srBrands)
        .where(inArray(srBrands.srId, srIds));
    const linked = new Set(links.map((l) => pairKey(l.srId, l.brandId)));

    const missing = [...toCheck.values()].find((p) => !linked.has(pairKey(p.srId, p.brandId)));
    if (!missing) return;

    const [[srRow], [brandRow]] = await Promise.all([
        tx.select({ name: sr.name }).from(sr).where(eq(sr.id, missing.srId)),
        tx.select({ name: brand.name }).from(brand).where(eq(brand.id, missing.brandId)),
    ]);
    if (!srRow) throw new Error(`SR #${missing.srId} was not found. It may have been merged into another SR; choose the SR again.`);
    throw new Error(
        `SR "${srRow.name}" does not work for ${brandRow ? `"${brandRow.name}"` : `company #${missing.brandId}`}. ` +
        `Add the company to the SR, or choose another SR.`,
    );
}

type OrderLine = { srId?: number | null; brandId: number; brand?: { name: string } | null };

/**
 * The company an order-adjustment commission is for. It must be a company the SR has
 * lines for on this order. When the SR's lines are all from one company it can be left
 * out and is filled in.
 */
export function resolveCommissionCompany(srId: number, brandId: number | undefined, srName: string, orderLines: OrderLine[]): number {
    const companies = new Map<number, string>();
    for (const line of orderLines) {
        if (line.srId === srId) companies.set(line.brandId, line.brand?.name ?? `company #${line.brandId}`);
    }
    if (brandId !== undefined) {
        if (!companies.has(brandId)) {
            throw new Error(`SR "${srName}" has no products from that company on this order, so the commission cannot be for it.`);
        }
        return brandId;
    }
    if (companies.size === 1) return [...companies.keys()][0]!;
    throw new Error(
        `SR "${srName}" sold products of ${[...companies.values()].join(", ")} on this order. Choose which company the commission is for.`,
    );
}
