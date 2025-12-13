import { z } from "zod";

const baseBrandSchema = z.object({
  name: z.string({error : "Brand name is required"}).min(1, "Brand name is required").max(100, "Brand name is too long"),
});

export const createBrandSchema = baseBrandSchema;

export const updateBrandSchema = baseBrandSchema;

export const getBrandsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type GetBrandsQuery = z.infer<typeof getBrandsQuerySchema>;

