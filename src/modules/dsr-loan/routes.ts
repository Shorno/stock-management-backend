import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as dsrLoanService from "./service";
import {
    getDSRLoanSummaryQuerySchema,
    getDSRLoanTransactionsQuerySchema,
    createLoanInputSchema,
    createRepaymentInputSchema,
} from "./validation";
import { requireRole } from "../../lib/auth-middleware";

const dsrLoanRoutes = new Hono();

// Get all DSRs with their loan summary
dsrLoanRoutes.get(
    "/",
    zValidator("query", getDSRLoanSummaryQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const summary = await dsrLoanService.getDSRLoanSummary(query);
            return c.json({ success: true, data: summary });
        } catch (error) {
            console.error("Error fetching DSR loan summary:", error);
            return c.json({ success: false, error: "Failed to fetch DSR loan summary" }, 500);
        }
    }
);

// Get detailed loan info for a specific DSR
dsrLoanRoutes.get("/:dsrId", async (c) => {
    try {
        const dsrId = Number(c.req.param("dsrId"));
        if (isNaN(dsrId)) {
            return c.json({ success: false, error: "Invalid DSR ID" }, 400);
        }

        const details = await dsrLoanService.getDSRLoanDetails(dsrId);
        if (!details) {
            return c.json({ success: false, error: "DSR not found" }, 404);
        }

        return c.json({ success: true, data: details });
    } catch (error) {
        console.error("Error fetching DSR loan details:", error);
        return c.json({ success: false, error: "Failed to fetch DSR loan details" }, 500);
    }
});

// Get transaction history for a specific DSR
dsrLoanRoutes.get(
    "/:dsrId/transactions",
    zValidator("query", getDSRLoanTransactionsQuerySchema),
    async (c) => {
        try {
            const dsrId = Number(c.req.param("dsrId"));
            if (isNaN(dsrId)) {
                return c.json({ success: false, error: "Invalid DSR ID" }, 400);
            }

            const query = c.req.valid("query");
            const transactions = await dsrLoanService.getDSRLoanTransactions({
                ...query,
                dsrId,
            });
            return c.json({ success: true, data: transactions });
        } catch (error) {
            console.error("Error fetching DSR loan transactions:", error);
            return c.json({ success: false, error: "Failed to fetch transactions" }, 500);
        }
    }
);

// Create a loan (DSR takes money from company)
dsrLoanRoutes.post(
    "/loan",
    zValidator("json", createLoanInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await dsrLoanService.createLoan(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            return c.json({
                success: true,
                message: result.message,
                transactionId: result.transactionId,
            });
        } catch (error) {
            console.error("Error creating loan:", error);
            return c.json({ success: false, error: "Failed to record loan" }, 500);
        }
    }
);

// Create a repayment (DSR pays back to company)
dsrLoanRoutes.post(
    "/repayment",
    zValidator("json", createRepaymentInputSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const result = await dsrLoanService.createRepayment(input);

            if (!result.success) {
                return c.json({ success: false, error: result.message }, 400);
            }

            return c.json({
                success: true,
                message: result.message,
                transactionId: result.transactionId,
            });
        } catch (error) {
            console.error("Error creating repayment:", error);
            return c.json({ success: false, error: "Failed to record repayment" }, 500);
        }
    }
);

// Delete a transaction (Admin only)
dsrLoanRoutes.delete("/transactions/:id", requireRole(["admin"]), async (c) => {
    try {
        const transactionId = Number(c.req.param("id"));
        if (isNaN(transactionId)) {
            return c.json({ success: false, error: "Invalid transaction ID" }, 400);
        }

        const result = await dsrLoanService.deleteTransaction(transactionId);

        if (!result.success) {
            return c.json({ success: false, error: result.message }, 404);
        }

        return c.json({ success: true, message: result.message });
    } catch (error) {
        console.error("Error deleting transaction:", error);
        return c.json({ success: false, error: "Failed to delete transaction" }, 500);
    }
});

export { dsrLoanRoutes };
