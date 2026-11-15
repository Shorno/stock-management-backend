import { sr, srDocuments } from "../../db/schema";

export type Sr = typeof sr.$inferSelect;
export type NewSr = typeof sr.$inferInsert;

// SR with its companies. `brand` is the first company (kept for older clients); `brands` is the full list.
export type SrWithBrand = Sr & {
  brand?: { id: number; name: string; isActive?: boolean } | null;
  brands: { id: number; name: string; isActive: boolean }[];
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

export type SrDocument = typeof srDocuments.$inferSelect;
