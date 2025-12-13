export { default } from "./routes";

export type { Product, NewProduct, ProductResponse } from "./types";
export type { CreateProductInput, UpdateProductInput, GetProductsQuery } from "./validation";

export {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
} from "./validation.js";

export * as productService from "./service.js";
export * as productController from "./controller.js";

