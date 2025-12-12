export { default } from "./routes.js";

export type { Product, NewProduct, ProductResponse } from "./types.js";
export type { CreateProductInput, UpdateProductInput, GetProductsQuery } from "./validation.js";

export {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
} from "./validation.js";

export * as productService from "./service.js";
export * as productController from "./controller.js";

