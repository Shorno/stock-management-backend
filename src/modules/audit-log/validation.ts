import { z } from "zod";

export const getLogsQuerySchema = z.object({
    search: z.string().optional(),
    userId: z.string().optional(),
    action: z.enum(["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "STATUS_CHANGE", "VIEW"]).optional(),
    entityType: z.enum(["product", "order", "stock", "user", "dsr", "route", "brand", "category", "wholesale_order"]).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.coerce.number().positive().max(100).optional().default(50),
    offset: z.coerce.number().nonnegative().optional().default(0),
});

export type GetLogsQuery = z.infer<typeof getLogsQuerySchema>;
