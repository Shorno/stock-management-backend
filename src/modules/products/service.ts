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
    category: data.category,
    brand: data.brand,
    price: data.price.toString(),
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

  if (query.category) {
    conditions.push(eq(product.category, query.category));
  }

  if (query.brand) {
    conditions.push(eq(product.brand, query.brand));
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
    db
      .select()
      .from(product)
      .where(whereClause)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(product.createdAt),
    db
      .select({ count: sql<number>`count(*)` })
      .from(product)
      .where(whereClause),
  ]);

  return {
    products,
    total: Number(totalResult[0]?.count || 0),
  };
};

export const getProductById = async (id: string): Promise<Product | undefined> => {
  const [foundProduct] = await db.select().from(product).where(eq(product.id, id)).limit(1);
  return foundProduct;
};

export const updateProduct = async (
  id: string,
  data: UpdateProductInput
): Promise<Product | undefined> => {
  const updateData: Partial<NewProduct> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.brand !== undefined) updateData.brand = data.brand;
  if (data.price !== undefined) updateData.price = data.price.toString();
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

export const deleteProduct = async (id: string): Promise<boolean> => {
  const result = await db.delete(product).where(eq(product.id, id)).returning();
  return result.length > 0;
};

export const updateProductQuantity = async (
  id: string,
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

