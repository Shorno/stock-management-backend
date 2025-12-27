import type { Context } from "hono";
import type { CreateStockBatchInput, UpdateStockBatchInput, GetStockBatchesQuery } from "./validation";
import type { StockBatchResponse } from "./types";
import * as stockBatchService from "./service";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";

type AppContext = Context<{
    Variables: {
        user: { id: string; email: string } | null;
        session: any | null;
    };
}, any, {
    in: {
        json?: CreateStockBatchInput | UpdateStockBatchInput;
        query?: GetStockBatchesQuery;
    };
    out: {
        json?: CreateStockBatchInput | UpdateStockBatchInput;
        query?: GetStockBatchesQuery;
    };
}>;

export const handleCreateStockBatch = async (c: AppContext): Promise<Response> => {
    try {
        const variantId = Number(c.req.param("variantId"));

        if (isNaN(variantId)) {
            return c.json<StockBatchResponse>(
                {
                    success: false,
                    message: "Invalid variant ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as CreateStockBatchInput;
        const newBatch = await stockBatchService.createStockBatch(variantId, validatedData);

        const userInfo = getUserInfoFromContext(c);
        await auditLog({ context: c, ...userInfo, action: "CREATE", entityType: "stock", entityId: newBatch.id, entityName: `Batch #${newBatch.id}`, newValue: newBatch });

        return c.json<StockBatchResponse>({ success: true, data: newBatch, message: "Stock batch added successfully" }, 201);
    } catch (error) {
        console.error("Error creating stock batch:", error);
        return c.json<StockBatchResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to create stock batch",
            },
            500
        );
    }
};

export const handleGetStockBatches = async (c: AppContext): Promise<Response> => {
    try {
        const variantId = Number(c.req.param("variantId"));

        if (isNaN(variantId)) {
            return c.json<StockBatchResponse>(
                {
                    success: false,
                    message: "Invalid variant ID",
                },
                400
            );
        }

        const validatedQuery = c.req.valid("query") as GetStockBatchesQuery;
        const { batches, total } = await stockBatchService.getStockBatchesByVariantId(variantId, validatedQuery);

        return c.json<StockBatchResponse>({
            success: true,
            data: batches,
            total,
        });
    } catch (error) {
        console.error("Error fetching stock batches:", error);
        return c.json<StockBatchResponse>(
            {
                success: false,
                message: "Failed to fetch stock batches",
            },
            500
        );
    }
};

export const handleGetStockBatchById = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<StockBatchResponse>(
                {
                    success: false,
                    message: "Invalid batch ID",
                },
                400
            );
        }

        const batch = await stockBatchService.getStockBatchById(id);

        if (!batch) {
            return c.json<StockBatchResponse>(
                {
                    success: false,
                    message: "Stock batch not found",
                },
                404
            );
        }

        return c.json<StockBatchResponse>({
            success: true,
            data: batch,
        });
    } catch (error) {
        console.error("Error fetching stock batch:", error);
        return c.json<StockBatchResponse>(
            {
                success: false,
                message: "Failed to fetch stock batch",
            },
            500
        );
    }
};

export const handleUpdateStockBatch = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<StockBatchResponse>(
                {
                    success: false,
                    message: "Invalid batch ID",
                },
                400
            );
        }

        const validatedData = c.req.valid("json") as UpdateStockBatchInput;
        const oldBatch = await stockBatchService.getStockBatchById(id);
        const updatedBatch = await stockBatchService.updateStockBatch(id, validatedData);

        if (!updatedBatch) {
            return c.json<StockBatchResponse>({ success: false, message: "Stock batch not found" }, 404);
        }

        const userInfo = getUserInfoFromContext(c);
        await auditLog({ context: c, ...userInfo, action: "UPDATE", entityType: "stock", entityId: id, entityName: `Batch #${id}`, oldValue: oldBatch, newValue: updatedBatch });

        return c.json<StockBatchResponse>({ success: true, data: updatedBatch, message: "Stock batch updated successfully" });
    } catch (error) {
        console.error("Error updating stock batch:", error);
        return c.json<StockBatchResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update stock batch",
            },
            500
        );
    }
};

export const handleDeleteStockBatch = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json<StockBatchResponse>(
                {
                    success: false,
                    message: "Invalid batch ID",
                },
                400
            );
        }

        const batch = await stockBatchService.getStockBatchById(id);
        const deleted = await stockBatchService.deleteStockBatch(id);

        if (!deleted) {
            return c.json<StockBatchResponse>({ success: false, message: "Stock batch not found" }, 404);
        }

        const userInfo = getUserInfoFromContext(c);
        await auditLog({ context: c, ...userInfo, action: "DELETE", entityType: "stock", entityId: id, entityName: `Batch #${id}`, oldValue: batch });

        return c.json<StockBatchResponse>({ success: true, message: "Stock batch deleted successfully" });
    } catch (error) {
        console.error("Error deleting stock batch:", error);
        return c.json<StockBatchResponse>(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to delete stock batch",
            },
            500
        );
    }
};
