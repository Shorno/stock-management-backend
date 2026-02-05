
import { count, eq, ilike } from "drizzle-orm";
import type { CreateCategoryInput, UpdateCategoryInput, GetCategoriesQuery } from "./validation";
import type { Category, NewCategory } from "./types";
import { db } from "../../db/config";
import { category } from "../../db/schema";

export const createCategory = async (data: CreateCategoryInput): Promise<Category> => {
  const newCategory: NewCategory = {
    name: data.name,
  };

  const [createdCategory] = await db.insert(category).values(newCategory).returning();
  if (!createdCategory) {
    throw new Error("Failed to create category");
  }
  return createdCategory;
};

export const getCategories = async (
  query: GetCategoriesQuery
): Promise<{ categories: Category[]; total: number }> => {
  const whereClause = query.search
    ? ilike(category.name, `%${query.search}%`)
    : undefined;

  const [categories, totalResult] = await Promise.all([
    db.query.category.findMany({
      where: whereClause,
      limit: query.limit,
      offset: query.offset,
      orderBy: (category, { asc }) => [asc(category.name)],
    }),
    db
      .select({ count: count() })
      .from(category)
      .where(whereClause),
  ]);

  return {
    categories,
    total: totalResult[0]?.count || 0,
  };
};

export const getCategoryById = async (id: number): Promise<Category | undefined> => {
  return await db.query.category.findFirst({
    where: (category, { eq }) => eq(category.id, id),
  });
};

export const updateCategory = async (
  id: number,
  data: UpdateCategoryInput
): Promise<Category | undefined> => {
  const updateData: Partial<NewCategory> = {
    name: data.name!,
  };

  const [updatedCategory] = await db
    .update(category)
    .set(updateData)
    .where(eq(category.id, id))
    .returning();

  return updatedCategory;
};

export const deleteCategory = async (id: number): Promise<boolean> => {
  const result = await db.delete(category).where(eq(category.id, id)).returning();
  return result.length > 0;
};

