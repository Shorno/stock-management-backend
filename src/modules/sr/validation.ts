import { z } from "zod";

const baseSrSchema = z.object({
  name: z.string().min(1, "SR name is required").max(100, "SR name is too long"),
  brandId: z.coerce.number().int("Brand ID must be an integer").positive("Brand ID must be positive").optional(),
});

export const createSrSchema = baseSrSchema;

export const updateSrSchema = baseSrSchema;

export const getSrsQuerySchema = z.object({
  search: z.string().optional(),
  brandId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateSrInput = z.infer<typeof createSrSchema>;
export type UpdateSrInput = z.infer<typeof updateSrSchema>;
export type GetSrsQuery = z.infer<typeof getSrsQuerySchema>;

export const srOrderItemsQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? Math.max(1, Number(val)) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(100, Math.max(1, Number(val))) : 10)),
});

export type SrOrderItemsQuery = z.infer<typeof srOrderItemsQuerySchema>;
