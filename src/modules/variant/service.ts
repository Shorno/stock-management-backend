import { eq, and, count } from "drizzle-orm";
import type { CreateVariantInput, UpdateVariantInput, GetVariantsQuery } from "./validation";
import type { ProductVariant, NewProductVariant, ProductVariantWithBatches } from "./types";
import { db } from "../../db/config";
import { productVariant } from "../../db/schema";

export const createVariant = async (
    productId: number,
    data: CreateVariantInput
): Promise<ProductVariant> => {
    // If this is marked as default, unset other defaults for this product
    if (data.isDefault) {
        await db
            .update(productVariant)
            .set({ isDefault: false })
            .where(eq(productVariant.productId, productId));
    }

    const newVariant: NewProductVariant = {
        productId,
        variantType: data.variantType,
        label: data.label,
        value: data.value?.toString(),
        unit: data.unit,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
    };

    const [createdVariant] = await db.insert(productVariant).values(newVariant).returning();
    if (!createdVariant) {
        throw new Error("Failed to create variant");
    }
    return createdVariant;
};

export const getVariantsByProductId = async (
    productId: number,
    query: GetVariantsQuery
): Promise<{ variants: ProductVariant[] | ProductVariantWithBatches[]; total: number }> => {
    const whereClause = query.includeInactive
        ? eq(productVariant.productId, productId)
        : and(eq(productVariant.productId, productId), eq(productVariant.isActive, true));

    const [variants, totalResult] = await Promise.all([
        db.query.productVariant.findMany({
            where: () => whereClause,
            limit: query.limit,
            offset: query.offset,
            orderBy: (variant, { asc }) => [asc(variant.label)],
            with: query.includeBatches ? { stockBatches: true } : undefined,
        }),
        db
            .select({ count: count() })
            .from(productVariant)
            .where(whereClause),
    ]);

    return {
        variants,
        total: totalResult[0]?.count || 0,
    };
};

export const getVariantById = async (
    id: number,
    includeBatches: boolean = false
): Promise<ProductVariant | ProductVariantWithBatches | undefined> => {
    return await db.query.productVariant.findFirst({
        where: (variant, { eq }) => eq(variant.id, id),
        with: includeBatches ? { stockBatches: true } : undefined,
    });
};

export const updateVariant = async (
    id: number,
    data: UpdateVariantInput
): Promise<ProductVariant | undefined> => {
    const existingVariant = await getVariantById(id);
    if (!existingVariant) {
        return undefined;
    }

    // If setting as default, unset others
    if (data.isDefault) {
        await db
            .update(productVariant)
            .set({ isDefault: false })
            .where(eq(productVariant.productId, existingVariant.productId));
    }

    const updateData: Partial<NewProductVariant> = {};

    if (data.variantType !== undefined) updateData.variantType = data.variantType;
    if (data.label !== undefined) updateData.label = data.label;
    if (data.value !== undefined) updateData.value = data.value.toString();
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (Object.keys(updateData).length === 0) {
        return existingVariant;
    }

    const [updatedVariant] = await db
        .update(productVariant)
        .set(updateData)
        .where(eq(productVariant.id, id))
        .returning();

    return updatedVariant;
};

export const deleteVariant = async (id: number): Promise<boolean> => {
    const result = await db.delete(productVariant).where(eq(productVariant.id, id)).returning();
    return result.length > 0;
};

// Helper to check if product has any variants
export const productHasVariants = async (productId: number): Promise<boolean> => {
    const result = await db
        .select({ count: count() })
        .from(productVariant)
        .where(eq(productVariant.productId, productId));
    return (result[0]?.count || 0) > 0;
};
