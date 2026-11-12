import { z } from "zod";

const template = z.string().trim().min(1, "Template cannot be empty").max(1000, "Template is too long");

export const updateSmsSettingsSchema = z.object({
    enabled: z.boolean().optional(),
    companyName: z.string().trim().max(150).optional(),
    autoSendOnSettlement: z.boolean().optional(),
    autoSendOnCollection: z.boolean().optional(),
    settlementTemplate: template.optional(),
    collectionTemplate: template.optional(),
    reminderTemplate: template.optional(),
    overdueDays: z.coerce.number().int().min(1).max(3650).optional(),
});
export type UpdateSmsSettingsInput = z.infer<typeof updateSmsSettingsSchema>;

export const smsTemplateInputSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100),
    body: template,
});
export type SmsTemplateInput = z.infer<typeof smsTemplateInputSchema>;

export const getRecipientsQuerySchema = z.object({
    routeId: z.coerce.number().int().positive().optional(),
    dueOnly: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
    minDays: z.coerce.number().int().min(0).optional(),
    search: z.string().trim().optional(),
});
export type GetRecipientsQuery = z.infer<typeof getRecipientsQuerySchema>;

export const sendSmsSchema = z.object({
    customerIds: z.array(z.number().int().positive()).min(1, "Select at least one customer").max(2000),
    message: template,
    type: z.enum(["reminder", "custom"]).default("custom"),
});
export type SendSmsInput = z.infer<typeof sendSmsSchema>;

export const previewSmsSchema = z.object({
    customerId: z.number().int().positive().optional(),
    message: template,
});
export type PreviewSmsInput = z.infer<typeof previewSmsSchema>;

export const testSmsSchema = z.object({
    phone: z.string().trim().min(1, "Phone is required"),
    message: z.string().trim().max(1000).optional(),
});

export const getSmsLogsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    type: z.enum(["settlement", "collection", "reminder", "custom", "test", "otp"]).optional(),
    status: z.enum(["sent", "failed"]).optional(),
    customerId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().optional(),
});
export type GetSmsLogsQuery = z.infer<typeof getSmsLogsQuerySchema>;
