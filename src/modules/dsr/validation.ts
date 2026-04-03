import { z } from "zod";

const baseDsrSchema = z.object({
  name: z.string().min(1, "DSR name is required").max(100, "DSR name is too long"),
});

export const createDsrSchema = baseDsrSchema;

// For DSR updates, name is required since it's the only updateable field
export const updateDsrSchema = baseDsrSchema;

export const getDsrsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

// Profile update schema (all fields optional)
export const updateDsrProfileSchema = z.object({
  phone: z.string().max(20).optional().nullable(),
  address: z.string().optional().nullable(),
  nidNumber: z.string().max(30).optional().nullable(),
  emergencyContact: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
  profilePhoto: z.string().optional().nullable(),
});

// Document create schema
export const createDsrDocumentSchema = z.object({
  documentType: z.enum(["nid_front", "nid_back", "photo", "contract", "guarantee", "other"]),
  documentName: z.string().min(1).max(200),
  documentUrl: z.string().url(),
  publicId: z.string().max(300).optional(),
});

export type CreateDsrInput = z.infer<typeof createDsrSchema>;
export type UpdateDsrInput = z.infer<typeof updateDsrSchema>;
export type GetDsrsQuery = z.infer<typeof getDsrsQuerySchema>;
export type UpdateDsrProfileInput = z.infer<typeof updateDsrProfileSchema>;
export type CreateDsrDocumentInput = z.infer<typeof createDsrDocumentSchema>;
