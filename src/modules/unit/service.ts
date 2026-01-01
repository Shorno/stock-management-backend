import { eq, ilike, count } from "drizzle-orm";
import type { CreateUnitInput, UpdateUnitInput, GetUnitsQuery } from "./validation";
import type { Unit, NewUnit } from "./types";
import { db } from "../../db/config";
import { unit } from "../../db/schema";

export const createUnit = async (data: CreateUnitInput): Promise<Unit> => {
    const newUnit: NewUnit = {
        name: data.name,
        abbreviation: data.abbreviation.toUpperCase(),
        multiplier: data.multiplier,
        isBase: data.isBase ?? false,
    };

    const [createdUnit] = await db.insert(unit).values(newUnit).returning();
    if (!createdUnit) {
        throw new Error("Failed to create unit");
    }
    return createdUnit;
};

export const getUnits = async (
    query: GetUnitsQuery
): Promise<{ units: Unit[]; total: number }> => {
    const whereClause = query.search
        ? ilike(unit.name, `%${query.search}%`)
        : undefined;

    const [units, totalResult] = await Promise.all([
        db.query.unit.findMany({
            where: whereClause,
            limit: query.limit,
            offset: query.offset,
            orderBy: (unit, { asc }) => [asc(unit.name)],
        }),
        db
            .select({ count: count() })
            .from(unit)
            .where(whereClause),
    ]);

    return {
        units,
        total: totalResult[0]?.count || 0,
    };
};

export const getUnitById = async (id: number): Promise<Unit | undefined> => {
    return await db.query.unit.findFirst({
        where: (unit, { eq }) => eq(unit.id, id),
    });
};

export const getUnitByAbbreviation = async (abbreviation: string): Promise<Unit | undefined> => {
    return await db.query.unit.findFirst({
        where: (unit, { eq }) => eq(unit.abbreviation, abbreviation.toUpperCase()),
    });
};

export const updateUnit = async (
    id: number,
    data: UpdateUnitInput
): Promise<Unit | undefined> => {
    const updateData: Partial<NewUnit> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.abbreviation !== undefined) updateData.abbreviation = data.abbreviation.toUpperCase();
    if (data.multiplier !== undefined) updateData.multiplier = data.multiplier;
    if (data.isBase !== undefined) updateData.isBase = data.isBase;

    const [updatedUnit] = await db
        .update(unit)
        .set(updateData)
        .where(eq(unit.id, id))
        .returning();

    return updatedUnit;
};

export const deleteUnit = async (id: number): Promise<boolean> => {
    const result = await db.delete(unit).where(eq(unit.id, id)).returning();
    return result.length > 0;
};

// Get unit multiplier by abbreviation (for use in wholesale calculations)
export const getUnitMultiplier = async (abbreviation: string): Promise<number> => {
    const foundUnit = await getUnitByAbbreviation(abbreviation);
    return foundUnit ? foundUnit.multiplier : 1;
};
