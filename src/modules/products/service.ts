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
    supplierPrice: data.supplierPrice.toString(),
    sellPrice: data.sellPrice.toString(),
    quantity: data.quantity,
    freeQuantity: data.freeQuantity,
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
  console.log("Query parameters:", query);

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
    },
  });
};

export const updateProduct = async (
  id: number,
  data: UpdateProductInput
): Promise<Product | undefined> => {
  console.log("=== UPDATE PRODUCT SERVICE ===");
  console.log("Product ID:", id);
  console.log("Incoming data:", JSON.stringify(data, null, 2));

  const updateData: Partial<NewProduct> = {};

  if (data.name !== undefined) {
    console.log("Setting name:", data.name);
    updateData.name = data.name;
  }
  if (data.categoryId !== undefined) {
    console.log("Setting categoryId:", data.categoryId);
    updateData.categoryId = data.categoryId;
  }
  if (data.brandId !== undefined) {
    console.log("Setting brandId:", data.brandId);
    updateData.brandId = data.brandId;
  }
  if (data.supplierPrice !== undefined) {
    console.log("Setting supplierPrice:", data.supplierPrice);
    updateData.supplierPrice = data.supplierPrice.toString();
  }
  if (data.sellPrice !== undefined) {
    console.log("Setting sellPrice:", data.sellPrice);
    updateData.sellPrice = data.sellPrice.toString();
  }
  if (data.quantity !== undefined) {
    console.log("Setting quantity:", data.quantity);
    updateData.quantity = data.quantity;
  }
  if (data.freeQuantity !== undefined) {
    console.log("Setting freeQuantity:", data.freeQuantity);
    updateData.freeQuantity = data.freeQuantity;
  }

  console.log("Update data object:", JSON.stringify(updateData, null, 2));

  if (Object.keys(updateData).length === 0) {
    console.log("No fields to update, returning existing product");
    return getProductById(id);
  }

  console.log("Executing update query...");
  const [updatedProduct] = await db
    .update(product)
    .set(updateData)
    .where(eq(product.id, id))
    .returning();

  console.log("Updated product:", JSON.stringify(updatedProduct, null, 2));
  console.log("=== END UPDATE PRODUCT SERVICE ===");

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
  // First get the current product
  const currentProduct = await getProductById(id);
  if (!currentProduct) {
    return undefined;
  }

  // Update with the new quantity
  const [updatedProduct] = await db
    .update(product)
    .set({
      quantity: currentProduct.quantity + quantityChange,
    })
    .where(eq(product.id, id))
    .returning();

  return updatedProduct;
};

