import { z } from "zod";

const baseDsrSchema = z.object({
  name: z.string().min(1, "DSR name is required").max(100, "DSR name is too long"),
});

export const createDsrSchema = baseDsrSchema;

// For DSR updates, name is required since it's the only updateable field
export const updateDsrSchema = baseDsrSchema;

export const getDsrsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateDsrInput = z.infer<typeof createDsrSchema>;
export type UpdateDsrInput = z.infer<typeof updateDsrSchema>;
export type GetDsrsQuery = z.infer<typeof getDsrsQuerySchema>;

