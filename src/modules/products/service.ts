import { db } from "../../db/config";
import { product } from "../../db/schema";
import { eq, and, or, ilike, count } from "drizzle-orm";
import type { CreateProductInput, UpdateProductInput, GetProductsQuery } from "./validation";
import type { Product, NewProduct } from "./types";


export const createProduct = async (
  data: CreateProductInput
): Promise<Product> => {
  const newProduct: NewProduct = {
    name: data.name,
    categoryId: data.categoryId,
    brandId: data.brandId,
    lowStockThreshold: data.lowStockThreshold,
  };

  const [createdProduct] = await db.insert(product).values(newProduct).returning();
  if (!createdProduct) {
    throw new Error("Failed to create product");
  }
  return createdProduct;
};

export const getProducts = async (
  query: GetProductsQuery
): Promise<{ products: Product[]; total: number }> => {
  const conditions = [];

  if (query.categoryId) {
    conditions.push(eq(product.categoryId, query.categoryId));
  }

  if (query.brandId) {
    conditions.push(eq(product.brandId, query.brandId));
  }

  if (query.search) {
    conditions.push(
      or(
        ilike(product.name, `%${query.search}%`),
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [products, totalResult] = await Promise.all([
    db.query.product.findMany({
      where: whereClause,
      limit: query.limit,
      offset: query.offset,
      with: {
        category: true,
        brand: true,
        stockBatches: true,
      },
    }),
    db
      .select({ count: count() })
      .from(product)
      .where(whereClause),
  ]);

  return {
    products,
    total: totalResult[0]?.count || 0,
  };
};

export const getProductById = async (id: number): Promise<Product | undefined> => {
  return await db.query.product.findFirst({
    where: (product, { eq }) => eq(product.id, id),
    with: {
      category: true,
      brand: true,
      stockBatches: true,
    },
  });
};

export const updateProduct = async (
  id: number,
  data: UpdateProductInput
): Promise<Product | undefined> => {
  const updateData: Partial<NewProduct> = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.categoryId !== undefined) {
    updateData.categoryId = data.categoryId;
  }
  if (data.brandId !== undefined) {
    updateData.brandId = data.brandId;
  }
  if (data.lowStockThreshold !== undefined) {
    updateData.lowStockThreshold = data.lowStockThreshold;
  }

  if (Object.keys(updateData).length === 0) {
    return getProductById(id);
  }

  const [updatedProduct] = await db
    .update(product)
    .set(updateData)
    .where(eq(product.id, id))
    .returning();

  return updatedProduct;
};

export const deleteProduct = async (id: number): Promise<boolean> => {
  const result = await db.delete(product).where(eq(product.id, id)).returning();
  return result.length > 0;
};
