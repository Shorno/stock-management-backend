export { default } from "./routes";

export type { Product, NewProduct, ProductResponse } from "./types";
export type { CreateProductInput, UpdateProductInput, GetProductsQuery } from "./validation";

export {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
} from "./validation";

export * as productService from "./service";
export * as productController from "./controller";

