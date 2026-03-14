import { db } from "../../db/config";
import { sr, wholesaleOrderItems } from "../../db/schema";
import { eq, ilike, count, and, sql } from "drizzle-orm";
import type { CreateSrInput, UpdateSrInput, GetSrsQuery } from "./validation";
import type { SrWithBrand, NewSr } from "./types";

export const createSr = async (data: CreateSrInput): Promise<SrWithBrand> => {
  const newSr: NewSr = {
    name: data.name,
    brandId: data.brandId ?? null,
  };

  const [createdSr] = await db.insert(sr).values(newSr).returning();
  if (!createdSr) {
    throw new Error("Failed to create SR");
  }

  // Re-fetch with brand relation
  const srWithBrand = await getSrById(createdSr.id);
  return srWithBrand!;
};

export const getSrs = async (
  query: GetSrsQuery
): Promise<{ srs: SrWithBrand[]; total: number }> => {
  const conditions = [];

  if (query.search) {
    conditions.push(ilike(sr.name, `%${query.search}%`));
  }
  if (query.brandId) {
    conditions.push(eq(sr.brandId, query.brandId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [srs, totalResult] = await Promise.all([
    db.query.sr.findMany({
      where: whereClause,
      with: {
        brand: true,
      },
      limit: query.limit,
      offset: query.offset,
      orderBy: (sr, { asc }) => [asc(sr.name)],
    }),
    db
      .select({ count: count() })
      .from(sr)
      .where(whereClause),
  ]);

  return {
    srs: srs as SrWithBrand[],
    total: totalResult[0]?.count || 0,
  };
};

export const getSrById = async (id: number): Promise<SrWithBrand | undefined> => {
  const result = await db.query.sr.findFirst({
    where: (sr, { eq }) => eq(sr.id, id),
    with: {
      brand: true,
    },
  });
  return result as SrWithBrand | undefined;
};

export const updateSr = async (
  id: number,
  data: UpdateSrInput
): Promise<SrWithBrand | undefined> => {
  const updateData: Partial<NewSr> = {
    name: data.name!,
    brandId: data.brandId ?? null,
  };

  const [updatedSr] = await db
    .update(sr)
    .set(updateData)
    .where(eq(sr.id, id))
    .returning();

  if (!updatedSr) return undefined;

  // Re-fetch with brand relation
  return await getSrById(updatedSr.id);
};

export const deleteSr = async (id: number): Promise<boolean> => {
  const result = await db.delete(sr).where(eq(sr.id, id)).returning();
  return result.length > 0;
};

// Get SR stats: total orders, sales amount, quantity sold
export const getSrStats = async (id: number) => {
  const result = await db
    .select({
      totalOrders: sql<number>`COUNT(DISTINCT ${wholesaleOrderItems.orderId})`,
      totalSalesAmount: sql<number>`COALESCE(SUM(CAST(${wholesaleOrderItems.net} AS NUMERIC)), 0)`,
      totalQuantitySold: sql<number>`COALESCE(SUM(${wholesaleOrderItems.totalQuantity}), 0)`,
    })
    .from(wholesaleOrderItems)
    .where(eq(wholesaleOrderItems.srId, id));

  return {
    totalOrders: Number(result[0]?.totalOrders || 0),
    totalSalesAmount: Number(result[0]?.totalSalesAmount || 0),
    totalQuantitySold: Number(result[0]?.totalQuantitySold || 0),
  };
};

// Get order items linked to this SR (paginated, with product, brand, order details)
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

  return {
    items,
    total: Number(countResult[0]?.count || 0),
  };
};
