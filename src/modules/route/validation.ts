import { z } from "zod";

const baseRouteSchema = z.object({
  name: z.string().min(1, "Route name is required").max(100, "Route name is too long"),
});

export const createRouteSchema = baseRouteSchema;

// For route updates, name is required since it's the only updateable field
export const updateRouteSchema = baseRouteSchema;

export const getRoutesQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;
export type GetRoutesQuery = z.infer<typeof getRoutesQuerySchema>;

