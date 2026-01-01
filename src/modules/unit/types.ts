import { unit } from "../../db/schema";

export type Unit = typeof unit.$inferSelect;
export type NewUnit = typeof unit.$inferInsert;

export type UnitResponse =
    | {
        success: true;
        data?: Unit | Unit[];
        total?: number;
        message?: string;
    }
    | {
        success: false;
        message: string;
        errors?: Array<{ path: string; message: string }>;
    };
