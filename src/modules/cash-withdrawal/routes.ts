import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as withdrawalService from "./service";
import { getWithdrawalsQuerySchema, createWithdrawalInputSchema } from "./validation";

const cashWithdrawalRoutes = new Hono();

// Get all withdrawals
cashWithdrawalRoutes.get(
    "/",
    zValidator("query", getWithdrawalsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const withdrawals = await withdrawalService.getWithdrawals(query);
            return c.json({ success: true, data: withdrawals });
        } catch (error) {
            console.error("Error fetching withdrawals:", error);
            return c.json({ success: false, error: "Failed to fetch withdrawals" }, 500);
        }
    }
);

// Get total withdrawals for a date range
cashWithdrawalRoutes.get(
    "/total",
    zValidator("query", getWithdrawalsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const total = await withdrawalService.getTotalWithdrawals(query.startDate, query.endDate);
            return c.json({ success: true, data: { total } });
        } catch (error) {
            console.error("Error fetching total withdrawals:", error);
            return c.json({ success: false, error: "Failed to fetch total" }, 500);
        }
    }
);

// Create a withdrawal
cashWithdrawalRoutes.post(
    "/",
    zValidator("json", createWithdrawalInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await withdrawalService.createWithdrawal(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            return c.json({
                success: true,
                message: result.message,
                withdrawalId: result.withdrawalId,
            });
        } catch (error) {
            console.error("Error creating withdrawal:", error);
            return c.json({ success: false, error: "Failed to record withdrawal" }, 500);
        }
    }
);

// Delete a withdrawal
cashWithdrawalRoutes.delete("/:id", async (c) => {
    try {
        const withdrawalId = Number(c.req.param("id"));
        if (isNaN(withdrawalId)) {
            return c.json({ success: false, error: "Invalid withdrawal ID" }, 400);
        }

        const result = await withdrawalService.deleteWithdrawal(withdrawalId);

        if (!result.success) {
            return c.json({ success: false, error: result.message }, 404);
        }

        return c.json({ success: true, message: result.message });
    } catch (error) {
        console.error("Error deleting withdrawal:", error);
        return c.json({ success: false, error: "Failed to delete withdrawal" }, 500);
    }
});

export { cashWithdrawalRoutes };
