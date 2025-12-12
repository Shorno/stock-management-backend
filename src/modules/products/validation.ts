import {z} from "zod";

const baseProductSchema = z.object({
    name: z.string().min(1, "Product name is required").max(255, "Product name is too long"),
    category: z.string().min(1, "Category is required").max(100, "Category name is too long"),
    brand: z.string().min(1, "Brand is required").max(100, "Brand name is too long"),
    price: z.number().positive("Price must be a positive number").or(
        z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format").transform(Number)
    ),
    quantity: z.number().int("Quantity must be an integer").nonnegative("Quantity cannot be negative").default(0),
});


export const createProductSchema = baseProductSchema;


export const updateProductSchema = baseProductSchema.partial();

export const getProductsQuerySchema = z.object({
    category: z.string().optional(),
    brand: z.string().optional(),
    search: z.string().optional(),
    limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
    offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type GetProductsQuery = z.infer<typeof getProductsQuerySchema>;

