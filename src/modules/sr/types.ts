import { sr } from "../../db/schema";

export type Sr = typeof sr.$inferSelect;
export type NewSr = typeof sr.$inferInsert;

export type SrResponse =
  | {
      success: true;
      data?: Sr | Sr[];
      total?: number;
      message?: string;
    }
  | {
      success: false;
      message: string;
      errors?: Array<{ path: string; message: string }>;
    };
