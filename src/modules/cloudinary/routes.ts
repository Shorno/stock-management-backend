import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import crypto from "crypto";
import { logError } from "../../lib/error-handler";

const app = new Hono();

const signatureRequestSchema = z.object({
    folder: z.string().optional().default("customers"),
});

// Generate Cloudinary signature for signed direct upload
app.post(
    "/sign",
    zValidator("json", signatureRequestSchema),
    async (ctx) => {
        try {
            const { folder } = ctx.req.valid("json");

            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const apiKey = process.env.CLOUDINARY_API_KEY;
            const apiSecret = process.env.CLOUDINARY_API_SECRET;

            if (!cloudName || !apiKey || !apiSecret) {
                return ctx.json(
                    { success: false, message: "Cloudinary configuration missing" },
                    500
                );
            }

            const timestamp = Math.round(new Date().getTime() / 1000);

            // Parameters to sign (alphabetically sorted)
            const paramsToSign = {
                folder,
                timestamp,
            };

            // Create signature string
            const signatureString = Object.entries(paramsToSign)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => `${key}=${value}`)
                .join("&") + apiSecret;

            const signature = crypto
                .createHash("sha256")
                .update(signatureString)
                .digest("hex");

            return ctx.json({
                success: true,
                data: {
                    signature,
                    timestamp,
                    cloudName,
                    apiKey,
                    folder,
                },
            });
        } catch (error) {
            logError("Error generating Cloudinary signature:", error);
            return ctx.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Failed to generate signature",
                },
                500
            );
        }
    }
);

export default app;
