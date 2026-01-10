import { z } from "zod";

export const updateSettingsSchema = z.object({
    pendingOrderAlertDays: z.number().int().min(1).max(30).optional(),
    enablePendingOrderAlerts: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
