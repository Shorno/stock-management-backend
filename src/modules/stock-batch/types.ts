import { stockBatch } from "../../db/schema";

export type StockBatch = typeof stockBatch.$inferSelect;
export type NewStockBatch = typeof stockBatch.$inferInsert;

export type StockBatchResponse =
    | {
        success: true;
        data?: StockBatch | StockBatch[];
        total?: number;
        message?: string;
    }
    | {
        success: false;
        message: string;
        errors?: Array<{ path: string; message: string }>;
    };
