import { db } from "../../db/config/index.js";
import { brand } from "../../db/schema/index.js";
import { eq, ilike, count } from "drizzle-orm";
import { generateSlug } from "../../lib/slug.js";
import type { CreateBrandInput, UpdateBrandInput, GetBrandsQuery } from "./validation.js";
import type { Brand, NewBrand } from "./types.js";

export const createBrand = async (data: CreateBrandInput): Promise<Brand> => {
  const slug = generateSlug(data.name);

  const newBrand: NewBrand = {
    name: data.name,
    slug,
  };

  const [createdBrand] = await db.insert(brand).values(newBrand).returning();
  return createdBrand;
};

export const getBrands = async (
  query: GetBrandsQuery
): Promise<{ brands: Brand[]; total: number }> => {
  const whereClause = query.search
    ? ilike(brand.name, `%${query.search}%`)
    : undefined;

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
    slug: generateSlug(data.name!),
  };

  const [updatedBrand] = await db
    .update(brand)
    .set(updateData)
    .where(eq(brand.id, id))
    .returning();

  return updatedBrand;
};

export const deleteBrand = async (id: number): Promise<boolean> => {
  const result = await db.delete(brand).where(eq(brand.id, id)).returning();
  return result.length > 0;
};

