import { product } from "../../db/schema/index.js";

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;

export type ProductResponse = {
  success: boolean;
  data?: Product | Product[];
  message?: string;
  errors?: string[];
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
};

