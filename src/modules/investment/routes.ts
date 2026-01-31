import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as investmentService from "./service";
import {
    getInvestmentsQuerySchema,
    createInvestmentInputSchema,
    createWithdrawalInputSchema
} from "./validation";
import { requireRole } from "../../lib/auth-middleware";

const investmentRoutes = new Hono();

// ============ INVESTMENTS (DEPOSITS) ============

// Get all investments
investmentRoutes.get(
    "/",
    zValidator("query", getInvestmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const investments = await investmentService.getInvestments(query);
            return c.json({ success: true, data: investments });
        } catch (error) {
            console.error("Error fetching investments:", error);
            return c.json({ success: false, error: "Failed to fetch investments" }, 500);
        }
    }
);

// Get total investments for a date range
investmentRoutes.get(
    "/total",
    zValidator("query", getInvestmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const total = await investmentService.getTotalInvestments(query.startDate, query.endDate);
            return c.json({ success: true, data: { total } });
        } catch (error) {
            console.error("Error fetching total investments:", error);
            return c.json({ success: false, error: "Failed to fetch total" }, 500);
        }
    }
);

// Create an investment
investmentRoutes.post(
    "/",
    zValidator("json", createInvestmentInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await investmentService.createInvestment(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            return c.json({
                success: true,
                message: result.message,
                investmentId: result.investmentId,
            });
        } catch (error) {
            console.error("Error creating investment:", error);
            return c.json({ success: false, error: "Failed to record investment" }, 500);
        }
    }
);

// Delete an investment (Admin only)
investmentRoutes.delete("/:id", requireRole(["admin"]), async (c) => {
    try {
        const investmentId = Number(c.req.param("id"));
        if (isNaN(investmentId)) {
            return c.json({ success: false, error: "Invalid investment ID" }, 400);
        }

        const result = await investmentService.deleteInvestment(investmentId);

        if (!result.success) {
            return c.json({ success: false, error: result.message }, 404);
        }

        return c.json({ success: true, message: result.message });
    } catch (error) {
        console.error("Error deleting investment:", error);
        return c.json({ success: false, error: "Failed to delete investment" }, 500);
    }
});

// ============ WITHDRAWALS ============

// Get all withdrawals
investmentRoutes.get(
    "/withdrawals",
    zValidator("query", getInvestmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const withdrawals = await investmentService.getWithdrawals(query);
            return c.json({ success: true, data: withdrawals });
        } catch (error) {
            console.error("Error fetching withdrawals:", error);
            return c.json({ success: false, error: "Failed to fetch withdrawals" }, 500);
        }
    }
);

// Get total withdrawals for a date range
investmentRoutes.get(
    "/withdrawals/total",
    zValidator("query", getInvestmentsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const total = await investmentService.getTotalWithdrawals(query.startDate, query.endDate);
            return c.json({ success: true, data: { total } });
        } catch (error) {
            console.error("Error fetching total withdrawals:", error);
            return c.json({ success: false, error: "Failed to fetch total" }, 500);
        }
    }
);

// Get current investment balance
investmentRoutes.get(
    "/balance",
    async (c) => {
        try {
            const balance = await investmentService.getInvestmentBalance();
            return c.json({ success: true, data: { balance } });
        } catch (error) {
            console.error("Error fetching investment balance:", error);
            return c.json({ success: false, error: "Failed to fetch balance" }, 500);
        }
    }
);

// Create a withdrawal
investmentRoutes.post(
    "/withdrawals",
    zValidator("json", createWithdrawalInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await investmentService.createWithdrawal(input);

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

// Delete a withdrawal (Admin only)
investmentRoutes.delete("/withdrawals/:id", requireRole(["admin"]), async (c) => {
    try {
        const withdrawalId = Number(c.req.param("id"));
        if (isNaN(withdrawalId)) {
            return c.json({ success: false, error: "Invalid withdrawal ID" }, 400);
        }

        const result = await investmentService.deleteWithdrawal(withdrawalId);

        if (!result.success) {
            return c.json({ success: false, error: result.message }, 404);
        }

        return c.json({ success: true, message: result.message });
    } catch (error) {
        console.error("Error deleting withdrawal:", error);
        return c.json({ success: false, error: "Failed to delete withdrawal" }, 500);
    }
});

export { investmentRoutes };
