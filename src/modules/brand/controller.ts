import type { Context } from "hono";
import type { CreateBrandInput, UpdateBrandInput, GetBrandsQuery } from "./validation";
import type { BrandResponse } from "./types";
import * as brandService from "./service";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";
import { formatDatabaseError } from "../../lib/error-handler";

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
      json?: CreateBrandInput | UpdateBrandInput;
      query?: GetBrandsQuery;
    };
    out: {
      json?: CreateBrandInput | UpdateBrandInput;
      query?: GetBrandsQuery;
    };
  }
>;

export const handleCreateBrand = async (c: AppContext): Promise<Response> => {
  try {
    const validatedData = c.req.valid("json") as CreateBrandInput;
    const newBrand = await brandService.createBrand(validatedData);

    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "CREATE", entityType: "brand", entityId: newBrand.id, entityName: newBrand.name, newValue: newBrand });

    return c.json<BrandResponse>({ success: true, data: newBrand, message: "Brand created successfully" }, 201);
  } catch (error) {
    console.error("Error creating brand:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "company"),
      },
      500
    );
  }
};

export const handleGetBrands = async (c: AppContext): Promise<Response> => {
  try {
    const validatedQuery = c.req.valid("query") as GetBrandsQuery;
    const { brands, total } = await brandService.getBrands(validatedQuery);

    return c.json<BrandResponse>({
      success: true,
      data: brands,
      total,
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: "Failed to fetch brands",
      },
      500
    );
  }
};

export const handleGetBrandById = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<BrandResponse>(
        {
          success: false,
          message: "Invalid brand ID",
        },
        400
      );
    }

    const brand = await brandService.getBrandById(id);

    if (!brand) {
      return c.json<BrandResponse>(
        {
          success: false,
          message: "Brand not found",
        },
        404
      );
    }

    return c.json<BrandResponse>({
      success: true,
      data: brand,
    });
  } catch (error) {
    console.error("Error fetching brand:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: "Failed to fetch brand",
      },
      500
    );
  }
};

export const handleUpdateBrand = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<BrandResponse>(
        {
          success: false,
          message: "Invalid brand ID",
        },
        400
      );
    }

    const validatedData = c.req.valid("json") as UpdateBrandInput;
    const oldBrand = await brandService.getBrandById(id);
    const updatedBrand = await brandService.updateBrand(id, validatedData);

    if (!updatedBrand) {
      return c.json<BrandResponse>({ success: false, message: "Brand not found" }, 404);
    }

    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "UPDATE", entityType: "brand", entityId: id, entityName: updatedBrand.name, oldValue: oldBrand, newValue: updatedBrand });

    return c.json<BrandResponse>({ success: true, data: updatedBrand, message: "Brand updated successfully" });
  } catch (error) {
    console.error("Error updating brand:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "company"),
      },
      500
    );
  }
};

export const handleDeleteBrand = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<BrandResponse>(
        {
          success: false,
          message: "Invalid brand ID",
        },
        400
      );
    }

    const brand = await brandService.getBrandById(id);
    const deleted = await brandService.deleteBrand(id);

    if (!deleted) {
      return c.json<BrandResponse>({ success: false, message: "Brand not found" }, 404);
    }

    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "DELETE", entityType: "brand", entityId: id, entityName: brand?.name, oldValue: brand });

    return c.json<BrandResponse>({ success: true, message: "Brand deleted successfully" });
  } catch (error) {
    console.error("Error deleting brand:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "company"),
      },
      500
    );
  }
};

