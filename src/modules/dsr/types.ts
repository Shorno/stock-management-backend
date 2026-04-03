import { dsr, dsrDocuments } from "../../db/schema";

export type Dsr = typeof dsr.$inferSelect;
export type NewDsr = typeof dsr.$inferInsert;

export type DsrDocument = typeof dsrDocuments.$inferSelect;
export type NewDsrDocument = typeof dsrDocuments.$inferInsert;

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
