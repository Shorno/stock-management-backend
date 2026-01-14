
import { db } from "../../db/config";
import {
    damageReturns,
    damageReturnItems,
    product,
    productVariant,
    brand,
    category,
    stockBatch,
    dsr,
    orderDamageItems,
    wholesaleOrders
} from "../../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export interface ReturnsListQueryParams {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    brandId?: string;
    dsrId?: string;
    routeId?: string; // Kept for interface consistency, though currently not linkable in backend
}

export interface ReturnListItem {
    id: string; // Unique ID (prefix + id)
    returnDate: string;
    productName: string;
    variantName?: string; // Variant label if applicable
    brandName: string;
    categoryName: string;
    returnAmount: number;
    adjustmentAmount: number;
    quantity: number;
    type: 'Order Adjustment' | 'Damage Return' | 'Order Damage';
    referenceNumber: string; // Order Number or Return Number
    dsrName?: string;
    unitPrice?: number; // Buying/cost price
    sellPrice?: number; // Selling price
}

export interface ReturnsListResponse {
    success: boolean;
    data: ReturnListItem[];
    total: number;
}

export const getReturnsList = async (params: ReturnsListQueryParams): Promise<ReturnsListResponse> => {
    const { startDate, endDate, limit = 50, offset = 0, brandId, dsrId } = params;

    // Get Damage Returns (standalone)
    const damageReturnsConditions = [eq(damageReturns.status, 'approved')];
    if (startDate) damageReturnsConditions.push(gte(damageReturns.returnDate, startDate));
    if (endDate) damageReturnsConditions.push(lte(damageReturns.returnDate, endDate));
    if (dsrId && dsrId !== "all") damageReturnsConditions.push(eq(damageReturns.dsrId, Number(dsrId)));

    const damageReturnsQuery = db
        .select({
            id: damageReturnItems.id,
            date: damageReturns.returnDate,
            productName: product.name,
            variantLabel: productVariant.label,
            brandName: brand.name,
            categoryName: category.name,
            returnAmount: damageReturnItems.total,
            quantity: damageReturnItems.quantity,
            returnNumber: damageReturns.returnNumber,
            unitPrice: damageReturnItems.unitPrice,
            batchSellPrice: stockBatch.sellPrice,
            dsrName: dsr.name,
        })
        .from(damageReturnItems)
        .innerJoin(damageReturns, eq(damageReturnItems.returnId, damageReturns.id))
        .innerJoin(productVariant, eq(damageReturnItems.variantId, productVariant.id))
        .leftJoin(stockBatch, eq(damageReturnItems.batchId, stockBatch.id))
        .innerJoin(product, eq(productVariant.productId, product.id))
        .leftJoin(brand, eq(product.brandId, brand.id))
        .leftJoin(category, eq(product.categoryId, category.id))
        .innerJoin(dsr, eq(damageReturns.dsrId, dsr.id));

    // Apply Brand Filter
    if (brandId && brandId !== "all") {
        damageReturnsConditions.push(eq(product.brandId, Number(brandId)));
    }

    // Apply WHERE clause
    damageReturnsQuery.where(and(...damageReturnsConditions));

    // Execute query
    const damageReturnsData = await damageReturnsQuery;

    // Format standalone damage returns
    const formattedDamageReturns: ReturnListItem[] = damageReturnsData.map(item => {
        const unitPrice = Number(item.unitPrice || 0);
        const sellPrice = Number(item.batchSellPrice || 0);
        const quantity = item.quantity;
        const adjustmentAmount = sellPrice > 0 ? (sellPrice - unitPrice) * quantity : 0;

        return {
            id: `DMG-${item.id}`,
            returnDate: item.date,
            productName: item.productName,
            variantName: item.variantLabel || undefined,
            brandName: item.brandName || 'N/A',
            categoryName: item.categoryName || 'N/A',
            returnAmount: Number(item.returnAmount || 0),
            adjustmentAmount: adjustmentAmount,
            quantity: item.quantity,
            type: 'Damage Return' as const,
            referenceNumber: item.returnNumber,
            dsrName: item.dsrName,
            unitPrice: unitPrice,
            sellPrice: sellPrice,
        };
    });

    // Get Order Damage Items (from order adjustments)
    const orderDamageConditions: any[] = [];
    if (startDate) orderDamageConditions.push(gte(wholesaleOrders.orderDate, startDate));
    if (endDate) orderDamageConditions.push(lte(wholesaleOrders.orderDate, endDate));
    if (dsrId && dsrId !== "all") orderDamageConditions.push(eq(wholesaleOrders.dsrId, Number(dsrId)));

    const orderDamageQuery = db
        .select({
            id: orderDamageItems.id,
            orderDate: wholesaleOrders.orderDate,
            orderNumber: wholesaleOrders.orderNumber,
            productName: orderDamageItems.productName,
            variantName: orderDamageItems.variantName,
            brandName: orderDamageItems.brandName,
            categoryName: category.name,
            quantity: orderDamageItems.quantity,
            unitPrice: orderDamageItems.unitPrice, // This is the buying/cost price
            total: orderDamageItems.total,
            reason: orderDamageItems.reason,
            dsrName: dsr.name,
            productId: orderDamageItems.productId,
            // Get sell price from the product's default variant's first batch
            sellPrice: stockBatch.sellPrice,
        })
        .from(orderDamageItems)
        .innerJoin(wholesaleOrders, eq(orderDamageItems.orderId, wholesaleOrders.id))
        .innerJoin(dsr, eq(wholesaleOrders.dsrId, dsr.id))
        // Join with product to get category
        .leftJoin(product, eq(orderDamageItems.productId, product.id))
        .leftJoin(category, eq(product.categoryId, category.id))
        // Join with variant and batch to get sell price
        .leftJoin(productVariant, eq(product.id, productVariant.productId))
        .leftJoin(stockBatch, eq(productVariant.id, stockBatch.variantId));

    if (orderDamageConditions.length > 0) {
        orderDamageQuery.where(and(...orderDamageConditions));
    }

    // Apply brand filter for order damage items
    if (brandId && brandId !== "all") {
        // Brand name is stored directly in orderDamageItems, filter on that
        orderDamageQuery.where(and(...orderDamageConditions));
    }

    const orderDamageData = await orderDamageQuery;

    // Format order damage items - deduplicate by id since joins may create multiple rows
    const uniqueOrderDamage = new Map<number, typeof orderDamageData[0]>();
    for (const item of orderDamageData) {
        if (!uniqueOrderDamage.has(item.id)) {
            uniqueOrderDamage.set(item.id, item);
        }
    }

    const formattedOrderDamage: ReturnListItem[] = Array.from(uniqueOrderDamage.values()).map(item => {
        const buyingPrice = Number(item.unitPrice || 0);
        const sellingPrice = Number(item.sellPrice || 0);
        const quantity = item.quantity;
        // Adjustment = (selling price - buying price) * quantity
        const adjustmentAmount = sellingPrice > 0 ? (sellingPrice - buyingPrice) * quantity : 0;

        return {
            id: `ODM-${item.id}`,
            returnDate: item.orderDate,
            productName: item.variantName ? `${item.productName} (${item.variantName})` : item.productName,
            brandName: item.brandName,
            categoryName: item.categoryName || 'N/A',
            returnAmount: Number(item.total || 0),
            adjustmentAmount: adjustmentAmount,
            quantity: item.quantity,
            type: 'Order Damage' as const,
            referenceNumber: item.orderNumber,
            dsrName: item.dsrName,
            unitPrice: buyingPrice,
            sellPrice: sellingPrice,
        };
    });

    // Combine and sort by date (descending)
    const allReturns = [...formattedDamageReturns, ...formattedOrderDamage];
    const sortedReturns = allReturns.sort((a, b) => {
        return new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime();
    });

    // Pagination
    const paginatedReturns = sortedReturns.slice(offset, offset + limit);

    return {
        success: true,
        data: paginatedReturns,
        total: sortedReturns.length,
    };
};
