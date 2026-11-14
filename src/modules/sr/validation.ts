import { z } from "zod";
import { activeOnlyQuery } from "../../lib/visibility";
import { normalizeBdPhone } from "../sms/template";

const baseSrSchema = z.object({
  name: z.string().min(1, "SR name is required").max(100, "SR name is too long"),
  brandId: z.coerce.number().int("Brand ID must be an integer").positive("Brand ID must be positive").optional(),
});

export const createSrSchema = baseSrSchema;

export const updateSrSchema = baseSrSchema;

export const getSrsQuerySchema = z.object({
  search: z.string().optional(),
  brandId: z.string().optional().transform((val) => (val ? Number(val) : undefined)),
  activeOnly: activeOnlyQuery,
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateSrInput = z.infer<typeof createSrSchema>;
export type UpdateSrInput = z.infer<typeof updateSrSchema>;
export type GetSrsQuery = z.infer<typeof getSrsQuerySchema>;

export const srOrderItemsQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? Math.max(1, Number(val)) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(100, Math.max(1, Number(val))) : 10)),
});

export type SrOrderItemsQuery = z.infer<typeof srOrderItemsQuerySchema>;

// ==================== Profile & documents ====================

// Empty strings clear a field (stored as NULL); undefined leaves it unchanged.
const optionalText = (max?: number) => {
  const base = max ? z.string().trim().max(max) : z.string().trim();
  return base.nullable().optional().transform((val) => (val === "" ? null : val));
};

// A Bangladeshi mobile number so SMS can reach the SR. Stored as 01XXXXXXXXX.
const srPhone = z
  .string()
  .nullable()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined || val === null || val.trim() === "") return val === undefined ? undefined : null;
    const normalized = normalizeBdPhone(val);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Bangladeshi mobile number, e.g. 01712345678" });
      return z.NEVER;
    }
    return `0${normalized.slice(3)}`;
  });

export const updateSrProfileSchema = z.object({
  phone: srPhone,
  address: optionalText(),
  nidNumber: optionalText(30),
  emergencyContact: optionalText(100),
  notes: optionalText(),
  profilePhoto: z.string().url().nullable().optional(),
});

export const SR_DOCUMENT_TYPES = ["nid_front", "nid_back", "photo", "contract", "guarantee", "other"] as const;

export const createSrDocumentSchema = z.object({
  documentType: z.enum(SR_DOCUMENT_TYPES),
  documentName: z.string().trim().min(1).max(200),
  documentUrl: z.string().url(),
  publicId: z.string().max(300).optional(),
});

export type UpdateSrProfileInput = z.infer<typeof updateSrProfileSchema>;
export type CreateSrDocumentInput = z.infer<typeof createSrDocumentSchema>;
