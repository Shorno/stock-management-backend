import { route } from "../../db/schema";

export type Route = typeof route.$inferSelect;
export type NewRoute = typeof route.$inferInsert;

export type RouteResponse =
  | {
      success: true;
      data?: Route | Route[];
      total?: number;
      message?: string;
    }
  | {
      success: false;
      message: string;
      errors?: Array<{ path: string; message: string }>;
    };

