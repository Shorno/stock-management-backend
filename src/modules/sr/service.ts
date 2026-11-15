import { db } from "../../db/config";
import { brand, sr, srBrands, srDocuments, wholesaleOrderItems, orderItemReturns } from "../../db/schema";
import { eq, ilike, count, and, sql, exists, inArray } from "drizzle-orm";
import type { CreateSrInput, UpdateSrInput, GetSrsQuery, UpdateSrProfileInput, CreateSrDocumentInput } from "./validation";
import { companyIdsFrom } from "./validation";
import type { SrWithBrand, NewSr, SrDocument } from "./types";
import { activeSrCondition } from "../../lib/visibility";

/** Thrown for bad input the client can fix (mapped to 400). */
export class SrInputError extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The SR's companies, as one list, with the first one also mirrored in sr.brand_id. */
const withBrands = <T extends { brandLinks?: { brand: { id: number; name: string; isActive: boolean } | null }[] }>(row: T) => {
  const { brandLinks, ...rest } = row;
  const brands = (brandLinks ?? [])
    .map((link) => link.brand)
    .filter((b): b is NonNullable<typeof b> => !!b)
    .map((b) => ({ id: b.id, name: b.name, isActive: b.isActive }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  return { ...rest, brands } as unknown as SrWithBrand;
};

const srRelations = {
  brand: true,
  brandLinks: { with: { brand: { columns: { id: true, name: true, isActive: true } } } },
} as const;

/** Replaces the SR's companies. Every id must be an existing company. */
async function setSrCompanies(tx: Tx, srId: number, brandIds: number[]) {
  if (brandIds.length > 0) {
    const found = await tx.select({ id: brand.id }).from(brand).where(inArray(brand.id, brandIds));
    if (found.length !== brandIds.length) throw new SrInputError("One or more selected companies were not found");
  }
  await tx.delete(srBrands).where(eq(srBrands.srId, srId));
  if (brandIds.length > 0) {
    await tx.insert(srBrands).values(brandIds.map((brandId) => ({ srId, brandId })));
  }
  // Older readers still look at sr.brand_id; keep it as the first company.
  await tx.update(sr).set({ brandId: brandIds[0] ?? null }).where(eq(sr.id, srId));
}

export const createSr = async (data: CreateSrInput): Promise<SrWithBrand> => {
  const id = await db.transaction(async (tx) => {
    const [createdSr] = await tx.insert(sr).values({ name: data.name } satisfies NewSr).returning({ id: sr.id });
    if (!createdSr) throw new Error("Failed to create SR");
    await setSrCompanies(tx, createdSr.id, companyIdsFrom(data));
    return createdSr.id;
  });
  return (await getSrById(id))!;
};

export const getSrs = async (
  query: GetSrsQuery
): Promise<{ srs: SrWithBrand[]; total: number }> => {
  const conditions = [];

  if (query.search) {
    conditions.push(ilike(sr.name, `%${query.search}%`));
  }
  if (query.brandId) {
    // SRs that work for this company (one of possibly several).
    conditions.push(exists(
      db.select({ one: sql`1` }).from(srBrands)
        .where(and(eq(srBrands.srId, sr.id), eq(srBrands.brandId, query.brandId))),
    ));
  }
  if (query.activeOnly) {
    conditions.push(activeSrCondition());
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [srs, totalResult] = await Promise.all([
    db.query.sr.findMany({
      where: whereClause,
      with: srRelations,
      limit: query.limit,
      offset: query.offset,
      orderBy: (sr, { asc }) => [asc(sr.name), asc(sr.id)],
    }),
    db
      .select({ count: count() })
      .from(sr)
      .where(whereClause),
  ]);

  return {
    srs: srs.map(withBrands),
    total: totalResult[0]?.count || 0,
  };
};

export const getSrById = async (id: number): Promise<SrWithBrand | undefined> => {
  const result = await db.query.sr.findFirst({
    where: (sr, { eq }) => eq(sr.id, id),
    with: srRelations,
  });
  return result ? withBrands(result) : undefined;
};

export const updateSr = async (
  id: number,
  data: UpdateSrInput
): Promise<SrWithBrand | undefined> => {
  const updatedId = await db.transaction(async (tx) => {
    const [updatedSr] = await tx.update(sr).set({ name: data.name }).where(eq(sr.id, id)).returning({ id: sr.id });
    if (!updatedSr) return undefined;
    await setSrCompanies(tx, id, companyIdsFrom(data));
    return updatedSr.id;
  });
  return updatedId ? getSrById(updatedId) : undefined;
};

/** Company ids the SR works for. */
export const getSrCompanyIds = async (srId: number): Promise<number[]> => {
  const rows = await db.select({ brandId: srBrands.brandId }).from(srBrands).where(eq(srBrands.srId, srId));
  return rows.map((r) => r.brandId);
};


/** Hides (false) or shows again (true) an SR in pickers for new entries. */
export const setSrActive = async (id: number, isActive: boolean): Promise<SrWithBrand | undefined> => {
  const [updated] = await db.update(sr).set({ isActive }).where(eq(sr.id, id)).returning({ id: sr.id });
  return updated ? getSrById(updated.id) : undefined;
};

export const deleteSr = async (id: number): Promise<boolean> => {
  const result = await db.delete(sr).where(eq(sr.id, id)).returning();
  return result.length > 0;
};

// Get SR stats: total orders, sales amount, quantity sold — adjusted for returns and damages
export const getSrStats = async (id: number) => {
  // Gross sales from order items
  const grossResult = await db
    .select({
      totalOrders: sql<number>`COUNT(DISTINCT ${wholesaleOrderItems.orderId})`,
      totalSalesAmount: sql<number>`COALESCE(SUM(CAST(${wholesaleOrderItems.net} AS NUMERIC)), 0)`,
      totalQuantitySold: sql<number>`COALESCE(SUM(${wholesaleOrderItems.totalQuantity}), 0)`,
    })
    .from(wholesaleOrderItems)
    .where(eq(wholesaleOrderItems.srId, id));

  // Returns: sum of returnAmount + adjustmentDiscount from order_item_returns
  // linked through orderItemId → wholesale_order_items where srId matches
  const returnsResult = await db
    .select({
      totalReturns: sql<number>`COALESCE(SUM(CAST(${orderItemReturns.returnAmount} AS NUMERIC) + CAST(${orderItemReturns.adjustmentDiscount} AS NUMERIC)), 0)`,
      totalReturnQty: sql<number>`COALESCE(SUM(${orderItemReturns.returnQuantity}), 0)`,
    })
    .from(orderItemReturns)
    .innerJoin(wholesaleOrderItems, eq(orderItemReturns.orderItemId, wholesaleOrderItems.id))
    .where(eq(wholesaleOrderItems.srId, id));

  const grossSales = Number(grossResult[0]?.totalSalesAmount || 0);
  const totalReturns = Number(returnsResult[0]?.totalReturns || 0);
  const grossQty = Number(grossResult[0]?.totalQuantitySold || 0);
  const returnQty = Number(returnsResult[0]?.totalReturnQty || 0);

  return {
    totalOrders: Number(grossResult[0]?.totalOrders || 0),
    totalSalesAmount: grossSales - totalReturns,
    totalQuantitySold: grossQty - returnQty,
    // Breakdown for transparency
    grossSalesAmount: grossSales,
    totalReturns,
  };
};

// Get order items linked to this SR (paginated, with product, brand, order details)
// Includes return/adjustment data so the frontend can display adjusted values
export const getSrOrderItems = async (id: number, limit = 10, offset = 0) => {
  const [items, countResult] = await Promise.all([
    db.query.wholesaleOrderItems.findMany({
      where: (items, { eq }) => eq(items.srId, id),
      with: {
        product: true,
        brand: true,
        batch: {
          with: {
            variant: true,
          },
        },
        order: {
          with: {
            dsr: true,
            route: true,
          },
        },
      },
      orderBy: (items, { desc }) => [desc(items.createdAt)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(wholesaleOrderItems)
      .where(eq(wholesaleOrderItems.srId, id)),
  ]);

  // Fetch returns for these items to compute adjusted values
  const itemIds = items.map((i) => i.id);
  let returnsMap = new Map<number, { returnQuantity: number; returnFreeQuantity: number; returnAmount: number; adjustmentDiscount: number }>();

  if (itemIds.length > 0) {
    const returnsData = await db
      .select({
        orderItemId: orderItemReturns.orderItemId,
        totalReturnQty: sql<number>`SUM(${orderItemReturns.returnQuantity})`,
        totalReturnFreeQty: sql<number>`SUM(${orderItemReturns.returnFreeQuantity})`,
        totalReturnAmount: sql<string>`SUM(CAST(${orderItemReturns.returnAmount} AS DECIMAL))`,
        totalAdjDiscount: sql<string>`SUM(CAST(COALESCE(${orderItemReturns.adjustmentDiscount}, '0') AS DECIMAL))`,
      })
      .from(orderItemReturns)
      .where(sql`${orderItemReturns.orderItemId} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(orderItemReturns.orderItemId);

    for (const r of returnsData) {
      returnsMap.set(r.orderItemId, {
        returnQuantity: Number(r.totalReturnQty) || 0,
        returnFreeQuantity: Number(r.totalReturnFreeQty) || 0,
        returnAmount: parseFloat(r.totalReturnAmount ?? "0") || 0,
        adjustmentDiscount: parseFloat(r.totalAdjDiscount ?? "0") || 0,
      });
    }
  }

  // Merge return data into items
  const itemsWithReturns = items.map((item) => {
    const ret = returnsMap.get(item.id) || { returnQuantity: 0, returnFreeQuantity: 0, returnAmount: 0, adjustmentDiscount: 0 };
    const net = parseFloat(item.net);
    const adjustedNet = net - ret.returnAmount - ret.adjustmentDiscount;

    return {
      ...item,
      returnQuantity: ret.returnQuantity,
      returnFreeQuantity: ret.returnFreeQuantity,
      returnAmount: ret.returnAmount,
      adjustmentDiscount: ret.adjustmentDiscount,
      adjustedNet: Math.max(0, adjustedNet),
    };
  });

  return {
    items: itemsWithReturns,
    total: Number(countResult[0]?.count || 0),
  };
};

// ==================== Profile ====================

const PROFILE_FIELDS = ["phone", "address", "nidNumber", "emergencyContact", "notes", "profilePhoto"] as const;

/** Updates only the profile fields that were sent; null clears a field. */
export const updateSrProfile = async (
  id: number,
  data: UpdateSrProfileInput
): Promise<SrWithBrand | undefined> => {
  const updateFields: Partial<NewSr> = {};
  for (const field of PROFILE_FIELDS) {
    if (data[field] !== undefined) updateFields[field] = data[field];
  }
  if (Object.keys(updateFields).length === 0) return getSrById(id);

  const [updated] = await db.update(sr).set(updateFields).where(eq(sr.id, id)).returning({ id: sr.id });
  return updated ? getSrById(updated.id) : undefined;
};

/** Private profile details only admins may see. Phone and photo stay visible to everyone signed in. */
const PRIVATE_FIELDS = ["address", "nidNumber", "emergencyContact", "notes"] as const;

export function withoutPrivateProfile<T extends Partial<Record<(typeof PRIVATE_FIELDS)[number], unknown>>>(row: T): T {
  const copy = { ...row };
  for (const field of PRIVATE_FIELDS) delete copy[field];
  return copy;
}

// ==================== Documents ====================

export const getSrDocuments = async (srId: number): Promise<SrDocument[]> => {
  return await db.query.srDocuments.findMany({
    where: (doc, { eq }) => eq(doc.srId, srId),
    orderBy: (doc, { desc }) => [desc(doc.createdAt), desc(doc.id)],
  });
};

export const addSrDocument = async (srId: number, data: CreateSrDocumentInput): Promise<SrDocument> => {
  const [doc] = await db
    .insert(srDocuments)
    .values({
      srId,
      documentType: data.documentType,
      documentName: data.documentName,
      documentUrl: data.documentUrl,
      publicId: data.publicId || null,
    })
    .returning();
  if (!doc) throw new Error("Failed to add document");
  return doc;
};

/** Deletes a document only when it belongs to this SR. */
export const deleteSrDocument = async (srId: number, docId: number): Promise<SrDocument | undefined> => {
  const [deleted] = await db
    .delete(srDocuments)
    .where(and(eq(srDocuments.id, docId), eq(srDocuments.srId, srId)))
    .returning();
  return deleted;
};
