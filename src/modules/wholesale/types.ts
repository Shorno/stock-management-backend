import { wholesaleOrders, wholesaleOrderItems } from "../../db/schema";

export type WholesaleOrder = typeof wholesaleOrders.$inferSelect;
export type NewWholesaleOrder = typeof wholesaleOrders.$inferInsert;

export type WholesaleOrderItem = typeof wholesaleOrderItems.$inferSelect;
export type NewWholesaleOrderItem = typeof wholesaleOrderItems.$inferInsert;

// Order with populated items and relations
export type OrderWithItems = WholesaleOrder & {
    items: (WholesaleOrderItem & {
        product?: { id: number; name: string };
        brand?: { id: number; name: string };
    })[];
    dsr?: { id: number; name: string };
    route?: { id: number; name: string };
    category?: { id: number; name: string } | null;
    brand?: { id: number; name: string } | null;
};

// Response types
export type WholesaleOrderResponse =
    | {
        success: true;
        data?: WholesaleOrder | WholesaleOrder[] | OrderWithItems | OrderWithItems[];
        total?: number;
        message?: string;
    }
    | {
        success: false;
        message: string;
        errors?: Array<{ path: string; message: string }>;
    };
