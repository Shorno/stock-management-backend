import type { Context } from "hono";
import * as auditLogService from "./service";
import type { GetLogsQuery } from "./validation";

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
            query?: GetLogsQuery;
        };
        out: {
            query?: GetLogsQuery;
        };
    }
>;

export const handleGetLogs = async (c: AppContext): Promise<Response> => {
    try {
        const query = c.req.valid("query") as GetLogsQuery;
        const { logs, total } = await auditLogService.getLogs(query);

        return c.json({
            success: true,
            data: logs,
            total,
        });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch audit logs",
            },
            500
        );
    }
};

export const handleGetLogById = async (c: AppContext): Promise<Response> => {
    try {
        const id = Number(c.req.param("id"));

        if (isNaN(id)) {
            return c.json(
                {
                    success: false,
                    message: "Invalid log ID",
                },
                400
            );
        }

        const log = await auditLogService.getLogById(id);

        if (!log) {
            return c.json(
                {
                    success: false,
                    message: "Audit log not found",
                },
                404
            );
        }

        return c.json({
            success: true,
            data: log,
        });
    } catch (error) {
        console.error("Error fetching audit log:", error);
        return c.json(
            {
                success: false,
                message: "Failed to fetch audit log",
            },
            500
        );
    }
};
