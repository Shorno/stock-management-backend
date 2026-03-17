import { db } from "../../db/config";
import { sr, wholesaleOrderItems, orderItemReturns } from "../../db/schema";
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
