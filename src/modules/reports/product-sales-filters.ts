import { inArray, isNull, or, type SQL } from "drizzle-orm";
import { wholesaleOrderItems } from "../../db/schema";

// SR id 0 stands for DB Point: order items sold without an SR
export const DB_POINT_SR_ID = 0;

// Company and SR filters for product sales. Each list narrows the items further.
export const buildProductSalesItemFilters = (query: { brandIds?: number[]; srIds?: number[] }): SQL[] => {
    const conditions: SQL[] = [];

    if (query.brandIds?.length) {
        conditions.push(inArray(wholesaleOrderItems.brandId, query.brandIds));
    }

    if (query.srIds?.length) {
        const srIds = query.srIds.filter((id) => id !== DB_POINT_SR_ID);
        const matches: SQL[] = [];
        if (srIds.length) matches.push(inArray(wholesaleOrderItems.srId, srIds));
        if (query.srIds.includes(DB_POINT_SR_ID)) matches.push(isNull(wholesaleOrderItems.srId));
        conditions.push(matches.length === 1 ? matches[0]! : or(...matches)!);
    }

    return conditions;
};
