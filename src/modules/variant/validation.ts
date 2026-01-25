import { z } from "zod";

const baseVariantSchema = z.object({
    variantType: z.string().optional(), // Optional - no longer required
    label: z.string().min(1, "Label is required").max(100, "Label is too long"),
    value: z.number().positive("Value must be positive").optional(),
    unit: z.string().max(20, "Unit is too long").optional(),
    isDefault: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
});

export const createVariantSchema = baseVariantSchema;

export const updateVariantSchema = baseVariantSchema.partial();

export const getVariantsQuerySchema = z.object({
    includeInactive: z.string().optional().transform((val) => val === "true"),
    includeBatches: z.string().optional().transform((val) => val === "true"),
    limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
    offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type GetVariantsQuery = z.infer<typeof getVariantsQuerySchema>;
