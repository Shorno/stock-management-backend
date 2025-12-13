import { category } from "../../db/schema";

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;

export type CategoryResponse =
  | {
      success: true;
      data?: Category | Category[];
      total?: number;
      message?: string;
    }
  | {
      success: false;
      message: string;
      errors?: Array<{ path: string; message: string }>;
    };

