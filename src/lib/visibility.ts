import { z } from "zod";
import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "../db/config";
import { brand, product, sr } from "../db/schema";

/**
 * Hidden companies and SRs (is_active = false) are left out of pickers used for new
 * entries. Lists return everything by default so history, reports and settlements keep
 * showing them; a picker asks for `?activeOnly=true`.
 */
export const activeOnlyQuery = z.string().optional().transform((val) => val === "true");

/** Body of the admin-only hide/unhide endpoints. */
export const setActiveSchema = z.object({ isActive: z.boolean({ error: "isActive must be true or false" }) });
export type SetActiveInput = z.infer<typeof setActiveSchema>;

const activeBrandIds = () => db.select({ id: brand.id }).from(brand).where(eq(brand.isActive, true));

export const activeBrandCondition = (): SQL => eq(brand.isActive, true);

/** Products of a hidden company are hidden with it. */
export const activeProductCondition = (): SQL => inArray(product.brandId, activeBrandIds());

/** A hidden SR, or an SR whose company is hidden, is left out. SRs with no company stay. */
export const activeSrCondition = (): SQL =>
    and(eq(sr.isActive, true), or(isNull(sr.brandId), inArray(sr.brandId, activeBrandIds())))!;
