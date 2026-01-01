import { z } from "zod";

const baseUnitSchema = z.object({
    name: z.string().min(1, "Unit name is required").max(50, "Unit name is too long"),
    abbreviation: z.string().min(1, "Abbreviation is required").max(20, "Abbreviation is too long")
        .transform((val) => val.toUpperCase()),
    multiplier: z.number().int("Multiplier must be a whole number").min(1, "Multiplier must be at least 1").max(99999999, "Multiplier is too large"),
    isBase: z.boolean().optional().default(false),
});

export const createUnitSchema = baseUnitSchema;

export const updateUnitSchema = baseUnitSchema.partial();

export const getUnitsQuerySchema = z.object({
    search: z.string().optional(),
    limit: z.string().optional().transform((val) => (val ? Number(val) : 50)),
    offset: z.string().optional().transform((val) => (val ? Number(val) : 0)),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type GetUnitsQuery = z.infer<typeof getUnitsQuerySchema>;
