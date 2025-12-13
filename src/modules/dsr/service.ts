import { db } from "../../db/config";
import { dsr } from "../../db/schema";
import { eq, ilike, count } from "drizzle-orm";
import { generateSlug } from "../../lib/slug";
import type { CreateDsrInput, UpdateDsrInput, GetDsrsQuery } from "./validation";
import type { Dsr, NewDsr } from "./types";

export const createDsr = async (data: CreateDsrInput): Promise<Dsr> => {
  const slug = generateSlug(data.name);

  const newDsr: NewDsr = {
    name: data.name,
    slug,
  };

  const [createdDsr] = await db.insert(dsr).values(newDsr).returning();
  if (!createdDsr) {
    throw new Error("Failed to create dsr");
  }
  return createdDsr;
};

export const getDsrs = async (
  query: GetDsrsQuery
): Promise<{ dsrs: Dsr[]; total: number }> => {
  const whereClause = query.search
    ? ilike(dsr.name, `%${query.search}%`)
    : undefined;

  const [dsrs, totalResult] = await Promise.all([
    db.query.dsr.findMany({
      where: whereClause,
      limit: query.limit,
      offset: query.offset,
      orderBy: (dsr, { asc }) => [asc(dsr.name)],
    }),
    db
      .select({ count: count() })
      .from(dsr)
      .where(whereClause),
  ]);

  return {
    dsrs,
    total: totalResult[0]?.count || 0,
  };
};

export const getDsrById = async (id: number): Promise<Dsr | undefined> => {
  return await db.query.dsr.findFirst({
    where: (dsr, { eq }) => eq(dsr.id, id),
  });
};

export const updateDsr = async (
  id: number,
  data: UpdateDsrInput
): Promise<Dsr | undefined> => {
  const updateData: Partial<NewDsr> = {
    name: data.name!,
    slug: generateSlug(data.name!),
  };

  const [updatedDsr] = await db
    .update(dsr)
    .set(updateData)
    .where(eq(dsr.id, id))
    .returning();

  return updatedDsr;
};

export const deleteDsr = async (id: number): Promise<boolean> => {
  const result = await db.delete(dsr).where(eq(dsr.id, id)).returning();
  return result.length > 0;
};

