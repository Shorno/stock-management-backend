import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as srCommissionService from "./service";
import { logError } from "../../lib/error-handler";
import { createCommissionSchema, getCommissionsQuerySchema } from "./validation";

const srCommissionRoutes = new Hono();

// Get commissions for an SR (with optional date filters)
srCommissionRoutes.get(
    "/:srId",
    zValidator("query", getCommissionsQuerySchema),
    async (c) => {
        try {
            const srId = Number(c.req.param("srId"));
            if (isNaN(srId)) {
                return c.json({ success: false, error: "Invalid SR ID" }, 400);
            }

            const query = c.req.valid("query");
            const result = await srCommissionService.getCommissions(srId, query);
            return c.json({ success: true, data: result });
        } catch (error) {
            logError("Error fetching SR commissions:", error);
            return c.json({ success: false, error: "Failed to fetch commissions" }, 500);
        }
    }
);

// Create a commission
srCommissionRoutes.post(
    "/",
    zValidator("json", createCommissionSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await srCommissionService.createCommission(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            return c.json({
                success: true,
                message: result.message,
                commissionId: result.commissionId,
            });
        } catch (error) {
            logError("Error creating SR commission:", error);
            return c.json({ success: false, error: "Failed to add commission" }, 500);
        }
    }
);

// Delete a commission
srCommissionRoutes.delete("/:id", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, error: "Invalid commission ID" }, 400);
        }

        const result = await srCommissionService.deleteCommission(id);

        if (!result.success) {
            return c.json({ success: false, error: result.message }, 404);
        }

        return c.json({ success: true, message: result.message });
    } catch (error) {
        logError("Error deleting SR commission:", error);
        return c.json({ success: false, error: "Failed to delete commission" }, 500);
    }
});

export { srCommissionRoutes };
