import { brand } from "../../db/schema";

export type Brand = typeof brand.$inferSelect;
export type NewBrand = typeof brand.$inferInsert;

export type BrandResponse =
  | {
      success: true;
      data?: Brand | Brand[];
      total?: number;
      message?: string;
    }
  | {
      success: false;
      message: string;
      errors?: Array<{ path: string; message: string }>;
    };

