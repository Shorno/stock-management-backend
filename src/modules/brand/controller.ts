import type { Context } from "hono";
import type { CreateBrandInput, UpdateBrandInput, GetBrandsQuery } from "./validation.js";
import type { BrandResponse } from "./types.js";
import * as brandService from "./service.js";

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

    return c.json<BrandResponse>(
      {
        success: true,
        data: newBrand,
        message: "Brand created successfully",
      },
      201
    );
  } catch (error) {
    console.error("Error creating brand:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create brand",
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
    const updatedBrand = await brandService.updateBrand(id, validatedData);

    if (!updatedBrand) {
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
      data: updatedBrand,
      message: "Brand updated successfully",
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to update brand",
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

    const deleted = await brandService.deleteBrand(id);

    if (!deleted) {
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
      message: "Brand deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    return c.json<BrandResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete brand",
      },
      500
    );
  }
};

