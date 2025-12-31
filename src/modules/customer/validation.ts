import { z } from "zod";

export const createCustomerSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    shopName: z.string().max(150).optional(),
    mobile: z.string().max(20).optional(),
    address: z.string().optional(),
    routeId: z.number().int().positive().optional(),
});

export const updateCustomerSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    shopName: z.string().max(150).optional().nullable(),
    mobile: z.string().max(20).optional().nullable(),
    address: z.string().optional().nullable(),
    routeId: z.number().int().positive().optional().nullable(),
});

export const getCustomersQuerySchema = z.object({
    search: z.string().optional(),
    routeId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type GetCustomersQuery = z.infer<typeof getCustomersQuerySchema>;
