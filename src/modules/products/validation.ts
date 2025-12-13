import {z} from "zod";

const baseProductSchema = z.object({
    name: z.string().min(1, "Product name is required").max(255, "Product name is too long"),
    categoryId: z.number().int("Category ID must be an integer").positive("Category ID must be positive"),
    brandId: z.number().int("Brand ID must be an integer").positive("Brand ID must be positive"),
    supplierPrice: z.number().positive("Supplier price must be a positive number").or(
        z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format").transform(Number)
    ),
    sellPrice: z.number().positive("Sell price must be a positive number").or(
        z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format").transform(Number)
    ),
    quantity: z.number().int("Quantity must be an integer").nonnegative("Quantity cannot be negative").default(0),
});


export const createProductSchema = baseProductSchema;


export const updateProductSchema = baseProductSchema.partial();

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

