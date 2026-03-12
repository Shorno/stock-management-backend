import { db } from "../../db/config";
import { sr } from "../../db/schema";
import { eq, ilike, count } from "drizzle-orm";
import type { CreateSrInput, UpdateSrInput, GetSrsQuery } from "./validation";
import type { Sr, NewSr } from "./types";

export const createSr = async (data: CreateSrInput): Promise<Sr> => {
  const newSr: NewSr = {
    name: data.name,
  };

  const [createdSr] = await db.insert(sr).values(newSr).returning();
  if (!createdSr) {
    throw new Error("Failed to create SR");
  }
  return createdSr;
};

export const getSrs = async (
  query: GetSrsQuery
): Promise<{ srs: Sr[]; total: number }> => {
  const whereClause = query.search
    ? ilike(sr.name, `%${query.search}%`)
    : undefined;

  const [srs, totalResult] = await Promise.all([
    db.query.sr.findMany({
      where: whereClause,
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
    srs,
    total: totalResult[0]?.count || 0,
  };
};

export const getSrById = async (id: number): Promise<Sr | undefined> => {
  return await db.query.sr.findFirst({
    where: (sr, { eq }) => eq(sr.id, id),
  });
};

export const updateSr = async (
  id: number,
  data: UpdateSrInput
): Promise<Sr | undefined> => {
  const updateData: Partial<NewSr> = {
    name: data.name!,
  };

  const [updatedSr] = await db
    .update(sr)
    .set(updateData)
    .where(eq(sr.id, id))
    .returning();

  return updatedSr;
};

export const deleteSr = async (id: number): Promise<boolean> => {
  const result = await db.delete(sr).where(eq(sr.id, id)).returning();
  return result.length > 0;
};
