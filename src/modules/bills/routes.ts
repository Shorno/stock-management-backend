import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as billsService from "./service";
import { createBillSchema, getBillsQuerySchema } from "./validation";
import { requireRole } from "../../lib/auth-middleware";

const billsRoutes = new Hono();

// Get all bills
billsRoutes.get(
    "/",
    zValidator("query", getBillsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const bills = await billsService.getBills(query);
            return c.json({ success: true, data: bills });
        } catch (error) {
            console.error("Error fetching bills:", error);
            return c.json({ success: false, error: "Failed to fetch bills" }, 500);
        }
    }
);

// Get bills summary
billsRoutes.get(
    "/summary",
    zValidator("query", getBillsQuerySchema),
    async (c) => {
        try {
            const query = c.req.valid("query");
            const summary = await billsService.getBillsSummary(query);
            return c.json({ success: true, data: summary });
        } catch (error) {
            console.error("Error fetching bills summary:", error);
            return c.json({ success: false, error: "Failed to fetch summary" }, 500);
        }
    }
);

// Create a new bill
billsRoutes.post(
    "/",
    zValidator("json", createBillSchema),
    async (c) => {
        try {
            const input = c.req.valid("json");
            const bill = await billsService.createBill(input);
            return c.json({ success: true, data: bill, message: "Bill created successfully" });
        } catch (error) {
            console.error("Error creating bill:", error);
            return c.json({ success: false, error: "Failed to create bill" }, 500);
        }
    }
);

// Delete a bill (Admin only)
billsRoutes.delete("/:id", requireRole(["admin"]), async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, error: "Invalid bill ID" }, 400);
        }

        const deleted = await billsService.deleteBill(id);
        if (!deleted) {
            return c.json({ success: false, error: "Bill not found" }, 404);
        }

        return c.json({ success: true, message: "Bill deleted successfully" });
    } catch (error) {
        console.error("Error deleting bill:", error);
        return c.json({ success: false, error: "Failed to delete bill" }, 500);
    }
});

export { billsRoutes };
