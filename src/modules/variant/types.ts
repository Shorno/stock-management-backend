import { productVariant } from "../../db/schema";

export type ProductVariant = typeof productVariant.$inferSelect;
export type NewProductVariant = typeof productVariant.$inferInsert;

export type ProductVariantWithBatches = ProductVariant & {
    stockBatches?: Array<{
        id: number;
        supplierPrice: string;
        sellPrice: string;
        remainingQuantity: number;
        remainingFreeQty: number;
    }>;
};

export type ProductVariantResponse =
    | {
        success: true;
        data?: ProductVariant | ProductVariant[] | ProductVariantWithBatches | ProductVariantWithBatches[];
        total?: number;
        message?: string;
    }
    | {
        success: false;
        message: string;
        errors?: Array<{ path: string; message: string }>;
    };
