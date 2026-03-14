import { sr } from "../../db/schema";

export type Sr = typeof sr.$inferSelect;
export type NewSr = typeof sr.$inferInsert;

// SR with brand relation included
export type SrWithBrand = Sr & {
  brand?: { id: number; name: string } | null;
};

export type SrResponse =
  | {
      success: true;
      data?: SrWithBrand | SrWithBrand[];
      total?: number;
      message?: string;
    }
  | {
      success: false;
      message: string;
      errors?: Array<{ path: string; message: string }>;
    };

// SR stats response type
export type SrStatsResponse =
  | {
      success: true;
      data: {
        sr: SrWithBrand;
        stats: {
          totalOrders: number;
          totalSalesAmount: number;
          totalQuantitySold: number;
        };
      };
    }
  | {
      success: false;
      message: string;
    };
