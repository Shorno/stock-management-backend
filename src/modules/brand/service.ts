
import { and, eq, ilike, count } from "drizzle-orm";
import { activeBrandCondition } from "../../lib/visibility";
import type { CreateBrandInput, UpdateBrandInput, GetBrandsQuery } from "./validation";
import type { Brand, NewBrand } from "./types";
import { db } from "../../db/config";
import { brand } from "../../db/schema";

export const createBrand = async (data: CreateBrandInput): Promise<Brand> => {
  const newBrand: NewBrand = {
    name: data.name,
  };

  const [createdBrand] = await db.insert(brand).values(newBrand).returning();
  if (!createdBrand) {
    throw new Error("Failed to create brand");
  }
  return createdBrand;
};

export const getBrands = async (
  query: GetBrandsQuery
): Promise<{ brands: Brand[]; total: number }> => {
  const whereClause = and(
    query.search ? ilike(brand.name, `%${query.search}%`) : undefined,
    query.activeOnly ? activeBrandCondition() : undefined,
  );

  const [brands, totalResult] = await Promise.all([
    db.query.brand.findMany({
      where: whereClause,
      limit: query.limit,
      offset: query.offset,
      orderBy: (brand, { asc }) => [asc(brand.name)],
    }),
    db
      .select({ count: count() })
      .from(brand)
      .where(whereClause),
  ]);

  return {
    brands,
    total: totalResult[0]?.count || 0,
  };
};

export const getBrandById = async (id: number): Promise<Brand | undefined> => {
  return await db.query.brand.findFirst({
    where: (brand, { eq }) => eq(brand.id, id),
  });
};

export const updateBrand = async (
  id: number,
  data: UpdateBrandInput
): Promise<Brand | undefined> => {
  const updateData: Partial<NewBrand> = {
    name: data.name!,
  };

  const [updatedBrand] = await db
    .update(brand)
    .set(updateData)
    .where(eq(brand.id, id))
    .returning();

  return updatedBrand;
};

/** Hides (false) or shows again (true) a company. Its products and SRs follow it in pickers. */
export const setBrandActive = async (id: number, isActive: boolean): Promise<Brand | undefined> => {
  const [updated] = await db.update(brand).set({ isActive }).where(eq(brand.id, id)).returning();
  return updated;
};

export const deleteBrand = async (id: number): Promise<boolean> => {
  const result = await db.delete(brand).where(eq(brand.id, id)).returning();
  return result.length > 0;
};

