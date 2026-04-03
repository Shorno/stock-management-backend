import type { Context } from "hono";
import type { CreateDsrInput, UpdateDsrInput, GetDsrsQuery, UpdateDsrProfileInput, CreateDsrDocumentInput } from "./validation";
import type { DsrResponse } from "./types";
import * as dsrService from "./service";
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
    logError("Error creating DSR:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "DSR"),
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
    logError("Error fetching DSRs:", error);
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
    logError("Error fetching DSR:", error);
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
    logError("Error updating DSR:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "DSR"),
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
    logError("Error deleting DSR:", error);
    return c.json<DsrResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "DSR"),
      },
      500
    );
  }
};

// ==================== Profile ====================

export const handleUpdateDsrProfile = async (c: Context): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ success: false, message: "Invalid DSR ID" }, 400);
    }

    const validatedData = c.req.valid("json") as UpdateDsrProfileInput;
    const updated = await dsrService.updateDsrProfile(id, validatedData);

    if (!updated) {
      return c.json({ success: false, message: "DSR not found" }, 404);
    }

    return c.json({ success: true, data: updated, message: "Profile updated successfully" });
  } catch (error) {
    logError("Error updating DSR profile:", error);
    return c.json({ success: false, message: "Failed to update profile" }, 500);
  }
};

// ==================== Documents ====================

export const handleGetDsrDocuments = async (c: Context): Promise<Response> => {
  try {
    const dsrId = Number(c.req.param("id"));
    if (isNaN(dsrId)) {
      return c.json({ success: false, message: "Invalid DSR ID" }, 400);
    }

    const documents = await dsrService.getDsrDocuments(dsrId);
    return c.json({ success: true, data: documents });
  } catch (error) {
    logError("Error fetching DSR documents:", error);
    return c.json({ success: false, message: "Failed to fetch documents" }, 500);
  }
};

export const handleAddDsrDocument = async (c: Context): Promise<Response> => {
  try {
    const dsrId = Number(c.req.param("id"));
    if (isNaN(dsrId)) {
      return c.json({ success: false, message: "Invalid DSR ID" }, 400);
    }

    // Verify DSR exists
    const dsr = await dsrService.getDsrById(dsrId);
    if (!dsr) {
      return c.json({ success: false, message: "DSR not found" }, 404);
    }

    const validatedData = c.req.valid("json") as CreateDsrDocumentInput;
    const document = await dsrService.addDsrDocument(dsrId, validatedData);

    return c.json({ success: true, data: document, message: "Document added successfully" }, 201);
  } catch (error) {
    logError("Error adding DSR document:", error);
    return c.json({ success: false, message: "Failed to add document" }, 500);
  }
};

export const handleDeleteDsrDocument = async (c: Context): Promise<Response> => {
  try {
    const docId = Number(c.req.param("docId"));
    if (isNaN(docId)) {
      return c.json({ success: false, message: "Invalid document ID" }, 400);
    }

    const deleted = await dsrService.deleteDsrDocument(docId);
    if (!deleted) {
      return c.json({ success: false, message: "Document not found" }, 404);
    }

    return c.json({ success: true, message: "Document deleted successfully" });
  } catch (error) {
    logError("Error deleting DSR document:", error);
    return c.json({ success: false, message: "Failed to delete document" }, 500);
  }
};
