import { z } from "zod";

const baseSrSchema = z.object({
  name: z.string().min(1, "SR name is required").max(100, "SR name is too long"),
});

export const createSrSchema = baseSrSchema;

// For SR updates, name is required since it's the only updateable field
export const updateSrSchema = baseSrSchema;

export const getSrsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateSrInput = z.infer<typeof createSrSchema>;
export type UpdateSrInput = z.infer<typeof updateSrSchema>;
export type GetSrsQuery = z.infer<typeof getSrsQuerySchema>;
