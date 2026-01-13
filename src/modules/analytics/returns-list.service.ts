
import { db } from "../../db/config";
import {
    damageReturns,
    damageReturnItems,
    product,
    productVariant,
    brand,
    category,
    stockBatch,
    dsr
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
    brandName: string;
    categoryName: string;
    returnAmount: number;
    adjustmentAmount: number;
    quantity: number;
    type: 'Order Adjustment' | 'Damage Return';
    referenceNumber: string; // Order Number or Return Number
    dsrName?: string;
}

export interface ReturnsListResponse {
    success: boolean;
    data: ReturnListItem[];
    total: number;
}

export const getReturnsList = async (params: ReturnsListQueryParams): Promise<ReturnsListResponse> => {
    const { startDate, endDate, limit = 50, offset = 0, brandId, dsrId } = params;

    // Get Damage Returns
    const damageReturnsConditions = [eq(damageReturns.status, 'approved')];
    if (startDate) damageReturnsConditions.push(gte(damageReturns.returnDate, startDate));
    if (endDate) damageReturnsConditions.push(lte(damageReturns.returnDate, endDate));
    if (dsrId && dsrId !== "all") damageReturnsConditions.push(eq(damageReturns.dsrId, Number(dsrId)));
    // Brand filter needs to be applied after join or in where clause if we join product
    // We are joining product below, so we can filter by product.brandId

    const damageReturnsQuery = db
        .select({
            id: damageReturnItems.id,
            date: damageReturns.returnDate,
            productName: product.name,
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

    // Format
    const formattedDamageReturns: ReturnListItem[] = damageReturnsData.map(item => {
        const unitPrice = Number(item.unitPrice || 0); // Now stored as Buying Price
        const sellPrice = Number(item.batchSellPrice || 0);
        const quantity = item.quantity;
        // Adjustment (Profit Loss) = (Selling Price - Buying Price) * Quantity
        // Since unitPrice is now Buying Price (Cost), and we fetch Sell Price from Batch
        const adjustmentAmount = sellPrice > 0 ? (sellPrice - unitPrice) * quantity : 0;

        return {
            id: `DMG - ${item.id} `,
            returnDate: item.date,
            productName: item.productName,
            brandName: item.brandName || 'N/A',
            categoryName: item.categoryName || 'N/A',
            returnAmount: Number(item.returnAmount || 0),
            adjustmentAmount: adjustmentAmount,
            quantity: item.quantity,
            type: 'Damage Return',
            referenceNumber: item.returnNumber,
            dsrName: item.dsrName,
            unitPrice: unitPrice,
            sellPrice: sellPrice,
        };
    });

    // Sort by date (descending)
    const sortedReturns = formattedDamageReturns.sort((a, b) => {
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
