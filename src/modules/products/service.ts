import { db } from "../../db/config/index.js";
import { product } from "../../db/schema/index.js";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import type { CreateProductInput, UpdateProductInput, GetProductsQuery } from "./validation.js";
import type { Product, NewProduct } from "./types.js";

export const createProduct = async (
  data: CreateProductInput,
  userId: string
): Promise<Product> => {
  const newProduct: NewProduct = {
    name: data.name,
    categoryId: data.categoryId,
    brandId: data.brandId,
    supplierPrice: data.supplierPrice.toString(),
    sellPrice: data.sellPrice.toString(),
    quantity: data.quantity,
    createdBy: userId,
  };

  const [createdProduct] = await db.insert(product).values(newProduct).returning();
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
      },
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(product)
      .where(whereClause),
  ]);

  return {
    products,
    total: Number(totalResult[0]?.count || 0),
  };
};

export const getProductById = async (id: number): Promise<Product | undefined> => {
  return await db.query.product.findFirst({
    where: (product, { eq }) => eq(product.id, id),
    with: {
      category: true,
      brand: true,
      creator: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

export const updateProduct = async (
  id: number,
  data: UpdateProductInput
): Promise<Product | undefined> => {
  const updateData: Partial<NewProduct> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
  if (data.brandId !== undefined) updateData.brandId = data.brandId;
  if (data.supplierPrice !== undefined) updateData.supplierPrice = data.supplierPrice.toString();
  if (data.sellPrice !== undefined) updateData.sellPrice = data.sellPrice.toString();
  if (data.quantity !== undefined) updateData.quantity = data.quantity;

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

export const updateProductQuantity = async (
  id: number,
  quantityChange: number
): Promise<Product | undefined> => {
  const [updatedProduct] = await db
    .update(product)
    .set({
      quantity: sql`${product.quantity} + ${quantityChange}`,
    })
    .where(eq(product.id, id))
    .returning();

  return updatedProduct;
};

