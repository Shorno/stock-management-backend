import type { Context } from "hono";
import type { CreateSrInput, UpdateSrInput, GetSrsQuery } from "./validation";
import type { SrResponse, SrStatsResponse } from "./types";
import * as srService from "./service";
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
      json?: CreateSrInput | UpdateSrInput;
      query?: GetSrsQuery;
    };
    out: {
      json?: CreateSrInput | UpdateSrInput;
      query?: GetSrsQuery;
    };
  }
>;

export const handleCreateSr = async (c: AppContext): Promise<Response> => {
  try {
    const validatedData = c.req.valid("json") as CreateSrInput;
    const newSr = await srService.createSr(validatedData);
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "CREATE", entityType: "sr", entityId: newSr.id, entityName: newSr.name, newValue: newSr });
    return c.json<SrResponse>({ success: true, data: newSr, message: "SR created successfully" }, 201);
  } catch (error) {
    logError("Error creating SR:", error);
    return c.json<SrResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "SR"),
      },
      500
    );
  }
};

export const handleGetSrs = async (c: AppContext): Promise<Response> => {
  try {
    const validatedQuery = c.req.valid("query") as GetSrsQuery;
    const { srs, total } = await srService.getSrs(validatedQuery);

    return c.json<SrResponse>({
      success: true,
      data: srs,
      total,
    });
  } catch (error) {
    logError("Error fetching SRs:", error);
    return c.json<SrResponse>(
      {
        success: false,
        message: "Failed to fetch SRs",
      },
      500
    );
  }
};

export const handleGetSrById = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<SrResponse>(
        {
          success: false,
          message: "Invalid SR ID",
        },
        400
      );
    }

    const sr = await srService.getSrById(id);

    if (!sr) {
      return c.json<SrResponse>(
        {
          success: false,
          message: "SR not found",
        },
        404
      );
    }

    return c.json<SrResponse>({
      success: true,
      data: sr,
    });
  } catch (error) {
    logError("Error fetching SR:", error);
    return c.json<SrResponse>(
      {
        success: false,
        message: "Failed to fetch SR",
      },
      500
    );
  }
};

export const handleUpdateSr = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<SrResponse>(
        {
          success: false,
          message: "Invalid SR ID",
        },
        400
      );
    }

    const validatedData = c.req.valid("json") as UpdateSrInput;
    const oldSr = await srService.getSrById(id);
    const updatedSr = await srService.updateSr(id, validatedData);
    if (!updatedSr) { return c.json<SrResponse>({ success: false, message: "SR not found" }, 404); }
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "UPDATE", entityType: "sr", entityId: id, entityName: updatedSr.name, oldValue: oldSr, newValue: updatedSr });
    return c.json<SrResponse>({ success: true, data: updatedSr, message: "SR updated successfully" });
  } catch (error) {
    logError("Error updating SR:", error);
    return c.json<SrResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "SR"),
      },
      500
    );
  }
};

export const handleDeleteSr = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<SrResponse>(
        {
          success: false,
          message: "Invalid SR ID",
        },
        400
      );
    }

    const sr = await srService.getSrById(id);
    const deleted = await srService.deleteSr(id);
    if (!deleted) { return c.json<SrResponse>({ success: false, message: "SR not found" }, 404); }
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "DELETE", entityType: "sr", entityId: id, entityName: sr?.name, oldValue: sr });
    return c.json<SrResponse>({ success: true, message: "SR deleted successfully" });
  } catch (error) {
    logError("Error deleting SR:", error);
    return c.json<SrResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "SR"),
      },
      500
    );
  }
};

export const handleGetSrStats = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<SrStatsResponse>(
        {
          success: false,
          message: "Invalid SR ID",
        },
        400
      );
    }

    const sr = await srService.getSrById(id);
    if (!sr) {
      return c.json<SrStatsResponse>(
        {
          success: false,
          message: "SR not found",
        },
        404
      );
    }

    const stats = await srService.getSrStats(id);

    return c.json({
      success: true,
      data: {
        sr,
        stats,
      },
    });
  } catch (error) {
    logError("Error fetching SR stats:", error);
    return c.json<SrStatsResponse>(
      {
        success: false,
        message: "Failed to fetch SR stats",
      },
      500
    );
  }
};

// GET /srs/:id/order-items - Paginated order items for an SR
export const handleGetSrOrderItems = async (c: Context) => {
  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id) || id <= 0) {
      return c.json({ success: false, message: "Invalid SR ID" }, 400);
    }

    const query = c.req.valid("query" as never) as { page: number; limit: number };
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const { items, total } = await srService.getSrOrderItems(id, limit, offset);

    return c.json({
      success: true,
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logError("Error fetching SR order items:", error);
    return c.json({ success: false, message: "Failed to fetch SR order items" }, 500);
  }
};
