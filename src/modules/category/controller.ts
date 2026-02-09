import type { Context } from "hono";
import type { CreateCategoryInput, UpdateCategoryInput, GetCategoriesQuery } from "./validation";
import type { CategoryResponse } from "./types";
import * as categoryService from "./service";
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
      json?: CreateCategoryInput | UpdateCategoryInput;
      query?: GetCategoriesQuery;
    };
    out: {
      json?: CreateCategoryInput | UpdateCategoryInput;
      query?: GetCategoriesQuery;
    };
  }
>;

export const handleCreateCategory = async (c: AppContext): Promise<Response> => {
  try {
    const validatedData = c.req.valid("json") as CreateCategoryInput;
    const newCategory = await categoryService.createCategory(validatedData);
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "CREATE", entityType: "category", entityId: newCategory.id, entityName: newCategory.name, newValue: newCategory });
    return c.json<CategoryResponse>({ success: true, data: newCategory, message: "Category created successfully" }, 201);
  } catch (error) {
    logError("Error creating category:", error);
    return c.json<CategoryResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "category"),
      },
      500
    );
  }
};

export const handleGetCategories = async (c: AppContext): Promise<Response> => {
  try {
    const validatedQuery = c.req.valid("query") as GetCategoriesQuery;
    const { categories, total } = await categoryService.getCategories(validatedQuery);

    return c.json<CategoryResponse>({
      success: true,
      data: categories,
      total,
    });
  } catch (error) {
    logError("Error fetching categories:", error);
    return c.json<CategoryResponse>(
      {
        success: false,
        message: "Failed to fetch categories",
      },
      500
    );
  }
};

export const handleGetCategoryById = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<CategoryResponse>(
        {
          success: false,
          message: "Invalid category ID",
        },
        400
      );
    }

    const category = await categoryService.getCategoryById(id);

    if (!category) {
      return c.json<CategoryResponse>(
        {
          success: false,
          message: "Category not found",
        },
        404
      );
    }

    return c.json<CategoryResponse>({
      success: true,
      data: category,
    });
  } catch (error) {
    logError("Error fetching category:", error);
    return c.json<CategoryResponse>(
      {
        success: false,
        message: "Failed to fetch category",
      },
      500
    );
  }
};

export const handleUpdateCategory = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<CategoryResponse>(
        {
          success: false,
          message: "Invalid category ID",
        },
        400
      );
    }

    const validatedData = c.req.valid("json") as UpdateCategoryInput;
    const oldCategory = await categoryService.getCategoryById(id);
    const updatedCategory = await categoryService.updateCategory(id, validatedData);
    if (!updatedCategory) { return c.json<CategoryResponse>({ success: false, message: "Category not found" }, 404); }
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "UPDATE", entityType: "category", entityId: id, entityName: updatedCategory.name, oldValue: oldCategory, newValue: updatedCategory });
    return c.json<CategoryResponse>({ success: true, data: updatedCategory, message: "Category updated successfully" });
  } catch (error) {
    logError("Error updating category:", error);
    return c.json<CategoryResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "category"),
      },
      500
    );
  }
};

export const handleDeleteCategory = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<CategoryResponse>(
        {
          success: false,
          message: "Invalid category ID",
        },
        400
      );
    }

    const category = await categoryService.getCategoryById(id);
    const deleted = await categoryService.deleteCategory(id);
    if (!deleted) { return c.json<CategoryResponse>({ success: false, message: "Category not found" }, 404); }
    const userInfo = getUserInfoFromContext(c);
    await auditLog({ context: c, ...userInfo, action: "DELETE", entityType: "category", entityId: id, entityName: category?.name, oldValue: category });
    return c.json<CategoryResponse>({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    logError("Error deleting category:", error);
    return c.json<CategoryResponse>(
      {
        success: false,
        message: formatDatabaseError(error, "category"),
      },
      500
    );
  }
};

