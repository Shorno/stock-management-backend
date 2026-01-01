import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    createDamageReturnSchema,
    updateReturnStatusSchema,
    getDamageReturnsQuerySchema,
} from "./validation";
import * as damageReturnService from "./service";

const app = new Hono();

// List damage returns with filters
app.get(
    "/",
    zValidator("query", getDamageReturnsQuerySchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json({
                success: false,
                message: "Invalid query parameters",
                errors: result.error.issues,
            }, 400);
        }
    }),
    async (ctx) => {
        try {
            const query = ctx.req.valid("query");
            const result = await damageReturnService.getDamageReturns(query);
            return ctx.json({
                success: true,
                data: result.returns,
                total: result.total,
            });
        } catch (error) {
            return ctx.json({
                success: false,
                message: error instanceof Error ? error.message : "Failed to fetch damage returns",
            }, 500);
        }
    }
);

// Get single damage return by ID
app.get("/:id", async (ctx) => {
    try {
        const id = parseInt(ctx.req.param("id"));
        if (isNaN(id)) {
            return ctx.json({ success: false, message: "Invalid ID" }, 400);
        }

        const result = await damageReturnService.getDamageReturnById(id);
        if (!result) {
            return ctx.json({ success: false, message: "Damage return not found" }, 404);
        }

        return ctx.json({ success: true, data: result });
    } catch (error) {
        return ctx.json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to fetch damage return",
        }, 500);
    }
});

// Create new damage return
app.post(
    "/",
    zValidator("json", createDamageReturnSchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json({
                success: false,
                message: "Validation failed",
                errors: result.error.issues,
            }, 400);
        }
    }),
    async (ctx) => {
        try {
            const data = ctx.req.valid("json");
            const result = await damageReturnService.createDamageReturn(data);
            return ctx.json({
                success: true,
                data: result,
                message: "Damage return created successfully",
            }, 201);
        } catch (error) {
            return ctx.json({
                success: false,
                message: error instanceof Error ? error.message : "Failed to create damage return",
            }, 500);
        }
    }
);

// Update damage return status (approve/reject)
app.patch(
    "/:id/status",
    zValidator("json", updateReturnStatusSchema, (result, ctx) => {
        if (!result.success) {
            return ctx.json({
                success: false,
                message: "Validation failed",
                errors: result.error.issues,
            }, 400);
        }
    }),
    async (ctx) => {
        try {
            const id = parseInt(ctx.req.param("id"));
            if (isNaN(id)) {
                return ctx.json({ success: false, message: "Invalid ID" }, 400);
            }

            const data = ctx.req.valid("json");
            // TODO: Get approvedById from auth context
            const approvedById = undefined;

            const result = await damageReturnService.updateDamageReturnStatus(id, data, approvedById);
            return ctx.json({
                success: true,
                data: result,
                message: `Damage return ${data.status} successfully`,
            });
        } catch (error) {
            return ctx.json({
                success: false,
                message: error instanceof Error ? error.message : "Failed to update status",
            }, 500);
        }
    }
);

// Delete damage return (only pending)
app.delete("/:id", async (ctx) => {
    try {
        const id = parseInt(ctx.req.param("id"));
        if (isNaN(id)) {
            return ctx.json({ success: false, message: "Invalid ID" }, 400);
        }

        await damageReturnService.deleteDamageReturn(id);
        return ctx.json({
            success: true,
            message: "Damage return deleted successfully",
        });
    } catch (error) {
        return ctx.json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to delete damage return",
        }, 500);
    }
});

export default app;
