import type { Context } from "hono";
import * as dsrTargetService from "./service";

type AppContext = Context<{
    Variables: {
        user: { id: string; email: string; role?: string } | null;
        session: any | null;
    };
}>;

export const handleGetAllTargets = async (c: AppContext): Promise<Response> => {
    try {
        const targets = await dsrTargetService.getAllTargets();
        return c.json({ success: true, data: targets });
    } catch (error) {
        console.error("Error fetching DSR targets:", error);
        return c.json({ success: false, message: "Failed to fetch DSR targets" }, 500);
    }
};

export const handleGetTargetById = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, message: "Invalid target ID" }, 400);
        }

        const target = await dsrTargetService.getTargetById(id);
        if (!target) {
            return c.json({ success: false, message: "Target not found" }, 404);
        }

        return c.json({ success: true, data: target });
    } catch (error) {
        console.error("Error fetching DSR target:", error);
        return c.json({ success: false, message: "Failed to fetch DSR target" }, 500);
    }
};

export const handleCreateTarget = async (c: AppContext): Promise<Response> => {
    try {
        const body = await c.req.json();
        const { dsrId, targetMonth, targetAmount } = body;

        if (!dsrId || !targetMonth || !targetAmount) {
            return c.json(
                { success: false, message: "dsrId, targetMonth, and targetAmount are required" },
                400
            );
        }

        const target = await dsrTargetService.createTarget({
            dsrId: Number(dsrId),
            targetMonth,
            targetAmount: String(targetAmount),
        });

        return c.json(
            { success: true, data: target, message: "Target saved successfully" },
            201
        );
    } catch (error) {
        console.error("Error creating DSR target:", error);
        return c.json({ success: false, message: "Failed to create DSR target" }, 500);
    }
};

export const handleUpdateTarget = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, message: "Invalid target ID" }, 400);
        }

        const body = await c.req.json();
        const target = await dsrTargetService.updateTarget(id, body);

        if (!target) {
            return c.json({ success: false, message: "Target not found" }, 404);
        }

        return c.json({ success: true, data: target, message: "Target updated successfully" });
    } catch (error) {
        console.error("Error updating DSR target:", error);
        return c.json({ success: false, message: "Failed to update DSR target" }, 500);
    }
};

export const handleDeleteTarget = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));
        if (isNaN(id)) {
            return c.json({ success: false, message: "Invalid target ID" }, 400);
        }

        const deleted = await dsrTargetService.deleteTarget(id);
        if (!deleted) {
            return c.json({ success: false, message: "Target not found" }, 404);
        }

        return c.json({ success: true, message: "Target deleted successfully" });
    } catch (error) {
        console.error("Error deleting DSR target:", error);
        return c.json({ success: false, message: "Failed to delete DSR target" }, 500);
    }
};

export const handleGetTargetsProgress = async (c: AppContext): Promise<Response> => {
    console.log("Fetching DSR target progress");
    try {
        const month = c.req.query("month"); // Optional, defaults to current month
        const targets = await dsrTargetService.getTargetsWithProgress(month);
        return c.json({ success: true, data: targets });
    } catch (error) {
        console.error("Error fetching DSR target progress:", error);
        return c.json({ success: false, message: "Failed to fetch target progress" }, 500);
    }
};
