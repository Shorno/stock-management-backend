import { z } from "zod";

const baseCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100, "Category name is too long"),
});

export const createCategorySchema = baseCategorySchema;

// For category updates, name is required since it's the only updateable field
export const updateCategorySchema = baseCategorySchema;

export const getCategoriesQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type GetCategoriesQuery = z.infer<typeof getCategoriesQuerySchema>;

