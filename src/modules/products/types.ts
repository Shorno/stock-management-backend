import { brand, category, product } from "../../db/schema";

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;
export type Category = typeof category.$inferSelect
export type Brand = typeof brand.$inferSelect


export type ProductResponse =
  | {
    success: true;
    data?: Product | Product[];
    total?: number;
    message?: string;
  }
  | {
    success: false;
    message: string;
    errors?: Array<{ path: string; message: string }>;
  };
