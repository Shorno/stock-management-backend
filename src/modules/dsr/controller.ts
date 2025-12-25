import type { Context } from "hono";
import type { CreateDsrInput, UpdateDsrInput, GetDsrsQuery } from "./validation";
import type { DsrResponse } from "./types";
import * as dsrService from "./service";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";

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
      json?: CreateDsrInput | UpdateDsrInput;
      query?: GetDsrsQuery;
    };
    out: {
      json?: CreateDsrInput | UpdateDsrInput;
      query?: GetDsrsQuery;
    };
  }
>;

export const handleCreateDsr = async (c: AppContext): Promise<Response> => {
  try {
    const validatedData = c.req.valid("json") as CreateDsrInput;
    const newDsr = await dsrService.createDsr(validatedData);
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "CREATE", entityType: "dsr", entityId: newDsr.id, entityName: newDsr.name, newValue: newDsr });
    return c.json<DsrResponse>({ success: true, data: newDsr, message: "DSR created successfully" }, 201);
  } catch (error) {
    console.error("Error creating DSR:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create DSR",
      },
      500
    );
  }
};

export const handleGetDsrs = async (c: AppContext): Promise<Response> => {
  try {
    const validatedQuery = c.req.valid("query") as GetDsrsQuery;
    const { dsrs, total } = await dsrService.getDsrs(validatedQuery);

    return c.json<DsrResponse>({
      success: true,
      data: dsrs,
      total,
    });
  } catch (error) {
    console.error("Error fetching DSRs:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: "Failed to fetch DSRs",
      },
      500
    );
  }
};

export const handleGetDsrById = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<DsrResponse>(
        {
          success: false,
          message: "Invalid DSR ID",
        },
        400
      );
    }

    const dsr = await dsrService.getDsrById(id);

    if (!dsr) {
      return c.json<DsrResponse>(
        {
          success: false,
          message: "DSR not found",
        },
        404
      );
    }

    return c.json<DsrResponse>({
      success: true,
      data: dsr,
    });
  } catch (error) {
    console.error("Error fetching DSR:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: "Failed to fetch DSR",
      },
      500
    );
  }
};

export const handleUpdateDsr = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<DsrResponse>(
        {
          success: false,
          message: "Invalid DSR ID",
        },
        400
      );
    }

    const validatedData = c.req.valid("json") as UpdateDsrInput;
    const oldDsr = await dsrService.getDsrById(id);
    const updatedDsr = await dsrService.updateDsr(id, validatedData);
    if (!updatedDsr) { return c.json<DsrResponse>({ success: false, message: "DSR not found" }, 404); }
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "UPDATE", entityType: "dsr", entityId: id, entityName: updatedDsr.name, oldValue: oldDsr, newValue: updatedDsr });
    return c.json<DsrResponse>({ success: true, data: updatedDsr, message: "DSR updated successfully" });
  } catch (error) {
    console.error("Error updating DSR:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to update DSR",
      },
      500
    );
  }
};

export const handleDeleteDsr = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<DsrResponse>(
        {
          success: false,
          message: "Invalid DSR ID",
        },
        400
      );
    }

    const dsr = await dsrService.getDsrById(id);
    const deleted = await dsrService.deleteDsr(id);
    if (!deleted) { return c.json<DsrResponse>({ success: false, message: "DSR not found" }, 404); }
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "DELETE", entityType: "dsr", entityId: id, entityName: dsr?.name, oldValue: dsr });
    return c.json<DsrResponse>({ success: true, message: "DSR deleted successfully" });
  } catch (error) {
    console.error("Error deleting DSR:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete DSR",
      },
      500
    );
  }
};

