import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as damageClaimsService from "./service";
import { requireRole } from "../../lib/auth-middleware";
import { auditLog, getUserInfoFromContext } from "../../lib/audit-logger";

const app = new Hono();

// Approve damage items
app.post(
    "/approve",
    requireRole(["admin", "super_admin"]),
    zValidator("json", z.object({
        sourceType: z.enum(["damage_return", "order_damage"]),
        itemIds: z.array(z.number()).min(1),
        approvalDate: z.string().optional(),
    })),
    async (ctx) => {
        try {
            const { sourceType, itemIds, approvalDate } = ctx.req.valid("json");
            const result = await damageClaimsService.approveItems(sourceType, itemIds, undefined, approvalDate);

            const userInfo = getUserInfoFromContext(ctx);
            await auditLog({
                context: ctx,
                ...userInfo,
                action: "APPROVE",
                entityType: "damage_claim",
                entityId: itemIds.join(","),
                entityName: `Damage items approved`,
                newValue: { sourceType, itemIds },
                metadata: { description: `Approved ${itemIds.length} ${sourceType} items` },
            });

            return ctx.json({ success: true, ...result });
        } catch (error) {
            return ctx.json({
                success: false,
                message: error instanceof Error ? error.message : "Failed to approve items",
            }, 500);
        }
    }
);

// List companies with damage totals
app.get("/companies", async (ctx) => {
    try {
        const companies = await damageClaimsService.getCompaniesWithDamageTotals();
        return ctx.json({ success: true, data: companies });
    } catch (error) {
        return ctx.json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to fetch companies",
        }, 500);
    }
});

// Get approved items for a company (grouped by product+variant)
app.get("/companies/:brandId/items", async (ctx) => {
    try {
        const brandId = parseInt(ctx.req.param("brandId"));
        if (isNaN(brandId)) return ctx.json({ success: false, message: "Invalid brand ID" }, 400);

        const startDate = ctx.req.query("startDate") || undefined;
        const endDate = ctx.req.query("endDate") || undefined;

        const items = await damageClaimsService.getCompanyItems(brandId, startDate, endDate);
        return ctx.json({ success: true, data: items });
    } catch (error) {
        return ctx.json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to fetch items",
        }, 500);
    }
});

// Get claim history for a company
app.get("/companies/:brandId/history", async (ctx) => {
    try {
        const brandId = parseInt(ctx.req.param("brandId"));
        if (isNaN(brandId)) return ctx.json({ success: false, message: "Invalid brand ID" }, 400);

        const history = await damageClaimsService.getClaimHistory(brandId);
        return ctx.json({ success: true, data: history });
    } catch (error) {
        return ctx.json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to fetch history",
        }, 500);
    }
});

// Record a claim
app.post(
    "/companies/:brandId/claim",
    requireRole(["admin", "super_admin"]),
    zValidator("json", z.object({
        amount: z.number().positive(),
        claimDate: z.string(),
        note: z.string().optional(),
        isWriteOff: z.boolean().optional(),
    })),
    async (ctx) => {
        try {
            const brandId = parseInt(ctx.req.param("brandId"));
            if (isNaN(brandId)) return ctx.json({ success: false, message: "Invalid brand ID" }, 400);

            const data = ctx.req.valid("json");
            const claim = await damageClaimsService.recordClaim(brandId, data);

            const userInfo = getUserInfoFromContext(ctx);
            await auditLog({
                context: ctx,
                ...userInfo,
                action: "CREATE",
                entityType: "damage_claim",
                entityId: claim.id,
                entityName: `Damage claim for brand #${brandId}`,
                newValue: claim,
                metadata: { description: `Recorded damage claim of ৳${data.amount}` },
            });

            return ctx.json({ success: true, data: claim, message: "Claim recorded successfully" }, 201);
        } catch (error) {
            return ctx.json({
                success: false,
                message: error instanceof Error ? error.message : "Failed to record claim",
            }, 500);
        }
    }
);

// Delete a claim
app.delete(
    "/:claimId",
    requireRole(["admin", "super_admin"]),
    async (ctx) => {
        try {
            const claimId = parseInt(ctx.req.param("claimId"));
            if (isNaN(claimId)) return ctx.json({ success: false, message: "Invalid claim ID" }, 400);

            await damageClaimsService.deleteClaim(claimId);

            const userInfo = getUserInfoFromContext(ctx);
            await auditLog({
                context: ctx,
                ...userInfo,
                action: "DELETE",
                entityType: "damage_claim",
                entityId: claimId,
                entityName: `Damage claim #${claimId}`,
                metadata: { description: "Deleted damage claim and reversed supplier credit" },
            });

            return ctx.json({ success: true, message: "Claim deleted successfully" });
        } catch (error) {
            return ctx.json({
                success: false,
                message: error instanceof Error ? error.message : "Failed to delete claim",
            }, 500);
        }
    }
);

export default app;
