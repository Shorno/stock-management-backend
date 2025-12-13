import { dsr } from "../../db/schema";

export type Dsr = typeof dsr.$inferSelect;
export type NewDsr = typeof dsr.$inferInsert;

export type DsrResponse =
  | {
      success: true;
      data?: Dsr | Dsr[];
      total?: number;
      message?: string;
    }
  | {
      success: false;
      message: string;
      errors?: Array<{ path: string; message: string }>;
    };

