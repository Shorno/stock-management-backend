import {z} from "zod";

const baseProductSchema = z.object({
    name: z.string().min(1, "Product name is required").max(255, "Product name is too long"),
    categoryId: z.coerce.number().int("Category ID must be an integer").positive("Category ID must be positive"),
    brandId: z.coerce.number().int("Brand ID must be an integer").positive("Brand ID must be positive"),
    supplierPrice: z.coerce.number().positive("Supplier price must be a positive number"),
    sellPrice: z.coerce.number().positive("Sell price must be a positive number"),
    quantity: z.coerce.number().int("Quantity must be an integer").nonnegative("Quantity cannot be negative").default(0),
});


export const createProductSchema = baseProductSchema;


export const updateProductSchema = z.object({
    name: z.string().min(1, "Product name is required").max(255, "Product name is too long").optional(),
    categoryId: z.coerce.number().int("Category ID must be an integer").positive("Category ID must be positive").optional(),
    brandId: z.coerce.number().int("Brand ID must be an integer").positive("Brand ID must be positive").optional(),
    supplierPrice: z.coerce.number().positive("Supplier price must be a positive number").optional(),
    sellPrice: z.coerce.number().positive("Sell price must be a positive number").optional(),
    quantity: z.coerce.number().int("Quantity must be an integer").nonnegative("Quantity cannot be negative").optional(),
});

export const getProductsQuerySchema = z.object({
    categoryId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    brandId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
    search: z.string().optional(),
    limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
    offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type GetProductsQuery = z.infer<typeof getProductsQuerySchema>;

