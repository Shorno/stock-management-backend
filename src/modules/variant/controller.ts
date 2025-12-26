import type { Context } from "hono";
import type { CreateVariantInput, UpdateVariantInput, GetVariantsQuery } from "./validation";
import type { ProductVariantResponse } from "./types";
import * as variantService from "./service";
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
            json?: CreateVariantInput | UpdateVariantInput;
            query?: GetVariantsQuery;
        };
        out: {
            json?: CreateVariantInput | UpdateVariantInput;
            query?: GetVariantsQuery;
        };
    }
>;

export const handleCreateVariant = async (c: AppContext): Promise<Response> => {
    try {
        const productId = Number(c.req.param("productId"));

        if (isNaN(productId)) {
            return c.json<ProductVariantResponse>(
                {
                    success: false,
                    message: "Invalid product ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as CreateVariantInput;
        const newVariant = await variantService.createVariant(productId, validatedData);

        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "CREATE",
            entityType: "variant",
            entityId: newVariant.id,
            entityName: `${newVariant.label} (${newVariant.variantType})`,
            newValue: newVariant,
        });

        return c.json<ProductVariantResponse>(
            { success: true, data: newVariant, message: "Variant created successfully" },
            201
        );
    } catch (error) {
        console.error("Error creating variant:", error);
        return c.json<ProductVariantResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to create variant",
            },
            500
        );
    }
};

export const handleGetVariants = async (c: AppContext): Promise<Response> => {
    try {
        const productId = Number(c.req.param("productId"));

        if (isNaN(productId)) {
            return c.json<ProductVariantResponse>(
                {
                    success: false,
                    message: "Invalid product ID",
                },
                400
            );
        }

        const validatedQuery = c.req.valid("query") as GetVariantsQuery;
        const { variants, total } = await variantService.getVariantsByProductId(productId, validatedQuery);

        return c.json<ProductVariantResponse>({
            success: true,
            data: variants,
            total,
        });
    } catch (error) {
        console.error("Error fetching variants:", error);
        return c.json<ProductVariantResponse>(
            {
                success: false,
                message: "Failed to fetch variants",
            },
            500
        );
    }
};

export const handleGetVariantById = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<ProductVariantResponse>(
                {
                    success: false,
                    message: "Invalid variant ID",
                },
                400
            );
        }

        const includeBatches = c.req.query("includeBatches") === "true";
        const variant = await variantService.getVariantById(id, includeBatches);

        if (!variant) {
            return c.json<ProductVariantResponse>(
                {
                    success: false,
                    message: "Variant not found",
                },
                404
            );
        }

        return c.json<ProductVariantResponse>({
            success: true,
            data: variant,
        });
    } catch (error) {
        console.error("Error fetching variant:", error);
        return c.json<ProductVariantResponse>(
            {
                success: false,
                message: "Failed to fetch variant",
            },
            500
        );
    }
};

export const handleUpdateVariant = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<ProductVariantResponse>(
                {
                    success: false,
                    message: "Invalid variant ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as UpdateVariantInput;
        const oldVariant = await variantService.getVariantById(id);
        const updatedVariant = await variantService.updateVariant(id, validatedData);

        if (!updatedVariant) {
            return c.json<ProductVariantResponse>({ success: false, message: "Variant not found" }, 404);
        }

        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "UPDATE",
            entityType: "variant",
            entityId: id,
            entityName: `${updatedVariant.label} (${updatedVariant.variantType})`,
            oldValue: oldVariant,
            newValue: updatedVariant,
        });

        return c.json<ProductVariantResponse>({
            success: true,
            data: updatedVariant,
            message: "Variant updated successfully",
        });
    } catch (error) {
        console.error("Error updating variant:", error);
        return c.json<ProductVariantResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update variant",
            },
            500
        );
    }
};

export const handleDeleteVariant = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<ProductVariantResponse>(
                {
                    success: false,
                    message: "Invalid variant ID",
                },
                400
            );
        }

        const variant = await variantService.getVariantById(id);
        const deleted = await variantService.deleteVariant(id);

        if (!deleted) {
            return c.json<ProductVariantResponse>({ success: false, message: "Variant not found" }, 404);
        }

        const userInfo = getUserInfoFromContext(c);
        await auditLog({
            context: c,
            ...userInfo,
            action: "DELETE",
            entityType: "variant",
            entityId: id,
            entityName: variant ? `${variant.label} (${variant.variantType})` : undefined,
            oldValue: variant,
        });

        return c.json<ProductVariantResponse>({ success: true, message: "Variant deleted successfully" });
    } catch (error) {
        console.error("Error deleting variant:", error);
        return c.json<ProductVariantResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to delete variant",
            },
            500
        );
    }
};
