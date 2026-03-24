import { db } from "../../db/config";
import {
    damageReturnItems,
    damageReturns,
    orderDamageItems,
    damageClaims,
    supplierPayments,
    brand,
    product,
    productVariant,
} from "../../db/schema";
import { eq, and, sql, sum, isNotNull, isNull, desc } from "drizzle-orm";

// ==================== APPROVE ITEMS ====================

export async function approveItems(
    sourceType: "damage_return" | "order_damage",
    itemIds: number[],
    approvedById?: number,
    approvalDate?: string
) {
    const today = approvalDate || new Date().toISOString().split("T")[0];

    if (sourceType === "damage_return") {
        const returnIdsToApprove = new Set<number>();
        for (const id of itemIds) {
            // Get the returnId for this item
            const [item] = await db
                .select({ returnId: damageReturnItems.returnId })
                .from(damageReturnItems)
                .where(eq(damageReturnItems.id, id))
                .limit(1);
            if (item) returnIdsToApprove.add(item.returnId);

            await db
                .update(damageReturnItems)
                .set({ approvedAt: today, approvedById: approvedById ?? null })
                .where(and(eq(damageReturnItems.id, id), isNull(damageReturnItems.approvedAt)));
        }
        // Also update parent damageReturns status to "approved"
        for (const returnId of returnIdsToApprove) {
            await db
                .update(damageReturns)
                .set({ status: "approved" })
                .where(eq(damageReturns.id, returnId));
        }
    } else {
        for (const id of itemIds) {
            await db
                .update(orderDamageItems)
                .set({ approvedAt: today, approvedById: approvedById ?? null })
                .where(and(eq(orderDamageItems.id, id), isNull(orderDamageItems.approvedAt)));
        }
    }

    return { approved: itemIds.length };
}

// ==================== GET COMPANIES WITH DAMAGE TOTALS ====================

export async function getCompaniesWithDamageTotals() {
    // Get approved damage return items grouped by brand
    const damageReturnsByBrand = await db
        .select({
            brandId: product.brandId,
            brandName: brand.name,
            totalAmount: sum(damageReturnItems.total),
            itemCount: sql<number>`count(${damageReturnItems.id})::int`,
        })
        .from(damageReturnItems)
        .innerJoin(damageReturns, eq(damageReturnItems.returnId, damageReturns.id))
        .innerJoin(productVariant, eq(damageReturnItems.variantId, productVariant.id))
        .innerJoin(product, eq(productVariant.productId, product.id))
        .leftJoin(brand, eq(product.brandId, brand.id))
        .where(and(
            eq(damageReturns.status, "approved"),
            isNotNull(damageReturnItems.approvedAt)
        ))
        .groupBy(product.brandId, brand.name);

    // Get approved order damage items grouped by brand
    const orderDamageByBrand = await db
        .select({
            brandName: orderDamageItems.brandName,
            totalAmount: sum(orderDamageItems.total),
            itemCount: sql<number>`count(${orderDamageItems.id})::int`,
            // Try to get brandId from the product reference
            brandId: product.brandId,
        })
        .from(orderDamageItems)
        .leftJoin(product, eq(orderDamageItems.productId, product.id))
        .leftJoin(brand, eq(product.brandId, brand.id))
        .where(isNotNull(orderDamageItems.approvedAt))
        .groupBy(orderDamageItems.brandName, product.brandId);

    // Get claims already made per brand
    const claimsByBrand = await db
        .select({
            brandId: damageClaims.brandId,
            totalClaimed: sum(damageClaims.amount),
        })
        .from(damageClaims)
        .groupBy(damageClaims.brandId);

    const claimsMap = new Map<number, number>();
    for (const c of claimsByBrand) {
        if (c.brandId) claimsMap.set(c.brandId, Number(c.totalClaimed || 0));
    }

    // Merge both sources by brand
    const companyMap = new Map<number, {
        brandId: number;
        brandName: string;
        totalApproved: number;
        totalClaimed: number;
        itemCount: number;
    }>();

    for (const item of damageReturnsByBrand) {
        const bId = item.brandId || 0;
        const existing = companyMap.get(bId);
        if (existing) {
            existing.totalApproved += Number(item.totalAmount || 0);
            existing.itemCount += item.itemCount;
        } else {
            companyMap.set(bId, {
                brandId: bId,
                brandName: item.brandName || "Unknown",
                totalApproved: Number(item.totalAmount || 0),
                totalClaimed: claimsMap.get(bId) || 0,
                itemCount: item.itemCount,
            });
        }
    }

    for (const item of orderDamageByBrand) {
        const bId = item.brandId || 0;
        const existing = companyMap.get(bId);
        if (existing) {
            existing.totalApproved += Number(item.totalAmount || 0);
            existing.itemCount += item.itemCount;
        } else {
            companyMap.set(bId, {
                brandId: bId,
                brandName: item.brandName || "Unknown",
                totalApproved: Number(item.totalAmount || 0),
                totalClaimed: claimsMap.get(bId) || 0,
                itemCount: item.itemCount,
            });
        }
    }

    // Recalculate claimed amounts for companies that were only in one source
    for (const [bId, company] of companyMap) {
        company.totalClaimed = claimsMap.get(bId) || 0;
    }

    return Array.from(companyMap.values()).map(c => ({
        ...c,
        remaining: c.totalApproved - c.totalClaimed,
    }));
}

// ==================== GET COMPANY ITEMS (GROUPED BY PRODUCT+VARIANT) ====================

export async function getCompanyItems(brandId: number, startDate?: string, endDate?: string) {
    // Build date conditions
    const dateConditions = [];
    if (startDate) {
        dateConditions.push(sql`${damageReturnItems.approvedAt} >= ${startDate}`);
    }
    if (endDate) {
        dateConditions.push(sql`${damageReturnItems.approvedAt} <= ${endDate}`);
    }

    // Get approved damage return items for this brand
    const damageItems = await db
        .select({
            productName: product.name,
            variantName: productVariant.label,
            productId: product.id,
            variantId: productVariant.id,
            quantity: damageReturnItems.quantity,
            total: damageReturnItems.total,
            approvedAt: damageReturnItems.approvedAt,
        })
        .from(damageReturnItems)
        .innerJoin(damageReturns, eq(damageReturnItems.returnId, damageReturns.id))
        .innerJoin(productVariant, eq(damageReturnItems.variantId, productVariant.id))
        .innerJoin(product, eq(productVariant.productId, product.id))
        .where(and(
            eq(damageReturns.status, "approved"),
            isNotNull(damageReturnItems.approvedAt),
            eq(product.brandId, brandId),
            ...dateConditions
        ));

    // Build date conditions for order damage items
    const orderDateConditions = [];
    if (startDate) {
        orderDateConditions.push(sql`${orderDamageItems.approvedAt} >= ${startDate}`);
    }
    if (endDate) {
        orderDateConditions.push(sql`${orderDamageItems.approvedAt} <= ${endDate}`);
    }

    // Get approved order damage items for this brand
    const orderItems = await db
        .select({
            productName: orderDamageItems.productName,
            variantName: orderDamageItems.variantName,
            productId: orderDamageItems.productId,
            variantId: orderDamageItems.variantId,
            quantity: orderDamageItems.quantity,
            total: orderDamageItems.total,
            approvedAt: orderDamageItems.approvedAt,
        })
        .from(orderDamageItems)
        .leftJoin(product, eq(orderDamageItems.productId, product.id))
        .where(and(
            isNotNull(orderDamageItems.approvedAt),
            eq(product.brandId, brandId),
            ...orderDateConditions
        ));

    // Group by product + variant
    const groupMap = new Map<string, {
        productName: string;
        variantName: string | null;
        productId: number | null;
        variantId: number | null;
        totalQuantity: number;
        totalAmount: number;
    }>();

    const addToGroup = (item: {
        productName: string;
        variantName: string | null;
        productId: number | null;
        variantId: number | null;
        quantity: number;
        total: string | number;
    }) => {
        const key = `${item.productId || item.productName}-${item.variantId || item.variantName || "default"}`;
        const existing = groupMap.get(key);
        if (existing) {
            existing.totalQuantity += item.quantity;
            existing.totalAmount += Number(item.total || 0);
        } else {
            groupMap.set(key, {
                productName: item.productName,
                variantName: item.variantName,
                productId: item.productId,
                variantId: item.variantId,
                totalQuantity: item.quantity,
                totalAmount: Number(item.total || 0),
            });
        }
    };

    for (const item of damageItems) {
        addToGroup({
            productName: item.productName,
            variantName: item.variantName,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            total: item.total,
        });
    }

    for (const item of orderItems) {
        addToGroup({
            productName: item.productName,
            variantName: item.variantName,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            total: item.total,
        });
    }

    return Array.from(groupMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

// ==================== GET CLAIM HISTORY ====================

export async function getClaimHistory(brandId: number) {
    return db.query.damageClaims.findMany({
        where: eq(damageClaims.brandId, brandId),
        orderBy: [desc(damageClaims.claimDate), desc(damageClaims.id)],
    });
}

// ==================== RECORD CLAIM ====================

export async function recordClaim(brandId: number, data: {
    amount: number;
    claimDate: string;
    note?: string;
}) {
    // Validate brand exists
    const [brandRecord] = await db.select().from(brand).where(eq(brand.id, brandId)).limit(1);
    if (!brandRecord) throw new Error("Brand not found");

    // Check remaining claimable amount
    const companies = await getCompaniesWithDamageTotals();
    const company = companies.find(c => c.brandId === brandId);
    if (!company) throw new Error("No approved damages found for this company");

    if (data.amount > company.remaining) {
        throw new Error(`Claim amount (৳${data.amount.toFixed(2)}) exceeds remaining claimable amount (৳${company.remaining.toFixed(2)})`);
    }

    // Create supplier payment (damage credit)
    const creditNote = `Damage claim: ${data.note || "Damage settlement"}`;
    const result = await db
        .insert(supplierPayments)
        .values({
            brandId,
            amount: data.amount.toString(),
            paymentDate: data.claimDate,
            paymentMethod: "Damage Credit",
            isDamageCredit: true,
            note: creditNote,
        })
        .returning();

    const payment = result[0];
    if (!payment) throw new Error("Failed to create supplier payment");

    // Create damage claim record
    const claimResult = await db
        .insert(damageClaims)
        .values({
            brandId,
            amount: data.amount.toString(),
            claimDate: data.claimDate,
            supplierPaymentId: payment.id,
            note: data.note,
        })
        .returning();

    const claim = claimResult[0];
    if (!claim) throw new Error("Failed to create damage claim");

    return claim;
}

// ==================== DELETE CLAIM ====================

export async function deleteClaim(claimId: number) {
    // Get the claim first
    const [claim] = await db
        .select()
        .from(damageClaims)
        .where(eq(damageClaims.id, claimId))
        .limit(1);

    if (!claim) throw new Error("Claim not found");

    // Delete the linked supplier payment (damage credit)
    if (claim.supplierPaymentId) {
        await db.delete(supplierPayments).where(eq(supplierPayments.id, claim.supplierPaymentId));
    }

    // Delete the claim
    await db.delete(damageClaims).where(eq(damageClaims.id, claimId));

    return { deleted: true };
}
