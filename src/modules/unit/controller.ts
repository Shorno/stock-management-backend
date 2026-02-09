import type { Context } from "hono";
import type { CreateUnitInput, UpdateUnitInput, GetUnitsQuery } from "./validation";
import type { UnitResponse } from "./types";
import * as unitService from "./service";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";
import { formatDatabaseError, logError } from "../../lib/error-handler";

type AppContext = Context<
    {
        Variables: {
            user: { id: string; email: string } | null;
            session: any | null;
        };
    },
    any,
    {
        in: {
            json?: CreateUnitInput | UpdateUnitInput;
            query?: GetUnitsQuery;
        };
        out: {
            json?: CreateUnitInput | UpdateUnitInput;
            query?: GetUnitsQuery;
        };
    }
>;

export const handleCreateUnit = async (c: AppContext): Promise<Response> => {
    try {
        const validatedData = c.req.valid("json") as CreateUnitInput;
        const newUnit = await unitService.createUnit(validatedData);

        const userInfo = getUserInfoFromContext(c);
        await auditLog({ context: c, ...userInfo, action: "CREATE", entityType: "unit", entityId: newUnit.id, entityName: newUnit.name, newValue: newUnit });

        return c.json<UnitResponse>({ success: true, data: newUnit, message: "Unit created successfully" }, 201);
    } catch (error) {
        logError("Error creating unit:", error);
        return c.json<UnitResponse>(
            {
                success: false,
                message: formatDatabaseError(error, "unit"),
            },
            500
        );
    }
};

export const handleGetUnits = async (c: AppContext): Promise<Response> => {
    try {
        const validatedQuery = c.req.valid("query") as GetUnitsQuery;
        const { units, total } = await unitService.getUnits(validatedQuery);

        return c.json<UnitResponse>({
            success: true,
            data: units,
            total,
        });
    } catch (error) {
        logError("Error fetching units:", error);
        return c.json<UnitResponse>(
            {
                success: false,
                message: "Failed to fetch units",
            },
            500
        );
    }
};

export const handleGetUnitById = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<UnitResponse>(
                {
                    success: false,
                    message: "Invalid unit ID",
                },
                400
            );
        }

        const unit = await unitService.getUnitById(id);

        if (!unit) {
            return c.json<UnitResponse>(
                {
                    success: false,
                    message: "Unit not found",
                },
                404
            );
        }

        return c.json<UnitResponse>({
            success: true,
            data: unit,
        });
    } catch (error) {
        logError("Error fetching unit:", error);
        return c.json<UnitResponse>(
            {
                success: false,
                message: "Failed to fetch unit",
            },
            500
        );
    }
};

export const handleUpdateUnit = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<UnitResponse>(
                {
                    success: false,
                    message: "Invalid unit ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as UpdateUnitInput;
        const oldUnit = await unitService.getUnitById(id);
        const updatedUnit = await unitService.updateUnit(id, validatedData);

        if (!updatedUnit) {
            return c.json<UnitResponse>({ success: false, message: "Unit not found" }, 404);
        }

        const userInfo = getUserInfoFromContext(c);
        await auditLog({ context: c, ...userInfo, action: "UPDATE", entityType: "unit", entityId: id, entityName: updatedUnit.name, oldValue: oldUnit, newValue: updatedUnit });

        return c.json<UnitResponse>({ success: true, data: updatedUnit, message: "Unit updated successfully" });
    } catch (error) {
        logError("Error updating unit:", error);
        return c.json<UnitResponse>(
            {
                success: false,
                message: formatDatabaseError(error, "unit"),
            },
            500
        );
    }
};

export const handleDeleteUnit = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<UnitResponse>(
                {
                    success: false,
                    message: "Invalid unit ID",
                },
                400
            );
        }

        const unit = await unitService.getUnitById(id);
        const deleted = await unitService.deleteUnit(id);

        if (!deleted) {
            return c.json<UnitResponse>({ success: false, message: "Unit not found" }, 404);
        }

        const userInfo = getUserInfoFromContext(c);
        await auditLog({ context: c, ...userInfo, action: "DELETE", entityType: "unit", entityId: id, entityName: unit?.name, oldValue: unit });

        return c.json<UnitResponse>({ success: true, message: "Unit deleted successfully" });
    } catch (error) {
        logError("Error deleting unit:", error);
        return c.json<UnitResponse>(
            {
                success: false,
                message: formatDatabaseError(error, "unit"),
            },
            500
        );
    }
};
