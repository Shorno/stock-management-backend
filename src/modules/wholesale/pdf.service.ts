import PDFDocument from "pdfkit";
import type { OrderWithItems } from "./types";

/**
 * Generate a professional PDF invoice for a wholesale order
 * Returns the PDF as a Buffer
 */
export async function generateInvoicePdf(order: OrderWithItems): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "A4",
                margin: 40,
                autoFirstPage: true,
            });

            const chunks: Buffer[] = [];
            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);

            // Colors
            const primaryColor = "#1a1a2e";
            const accentColor = "#4361ee";
            const lightGray = "#f8f9fa";
            const darkGray = "#6c757d";

            // Header Section - Compact
            doc.fillColor(primaryColor)
                .fontSize(24)
                .font("Helvetica-Bold")
                .text("INVOICE", 40, 40);

            doc.fillColor(accentColor)
                .fontSize(9)
                .font("Helvetica")
                .text("WHOLESALE ORDER", 40, 68);

            // Order Info (right side)
            doc.fillColor(primaryColor)
                .fontSize(9)
                .font("Helvetica-Bold")
                .text(`Invoice #: ${order.orderNumber}`, 350, 40, { align: "right" });

            doc.fillColor(darkGray)
                .fontSize(8)
                .font("Helvetica")
                .text(`Date: ${formatDate(order.orderDate)}`, 350, 54, { align: "right" });

            // Status Badge
            const statusColors: Record<string, string> = {
                pending: "#ffc107",
                confirmed: "#28a745",
                delivered: "#17a2b8",
                cancelled: "#dc3545",
                completed: "#28a745",
            };
            const statusColor = statusColors[order.status] || "#6c757d";

            doc.fillColor(statusColor).roundedRect(470, 68, 85, 16, 3).fill();
            doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
                .text(order.status.toUpperCase(), 470, 72, { width: 85, align: "center" });

            // Divider
            let currentY = 95;
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor("#e9ecef").lineWidth(1).stroke();
            currentY += 10;

            // DSR & Route Info - Single row
            doc.fontSize(8);
            doc.fillColor(darkGray).font("Helvetica").text("DSR:", 40, currentY);
            doc.fillColor(primaryColor).font("Helvetica-Bold").text(order.dsr?.name || "N/A", 65, currentY);

            doc.fillColor(darkGray).font("Helvetica").text("Route:", 200, currentY);
            doc.fillColor(primaryColor).font("Helvetica-Bold").text(order.route?.name || "N/A", 235, currentY);

            if (order.category) {
                doc.fillColor(darkGray).font("Helvetica").text("Category:", 350, currentY);
                doc.fillColor(primaryColor).font("Helvetica-Bold").text(order.category.name, 400, currentY);
            }

            currentY += 14;

            if (order.brand) {
                doc.fillColor(darkGray).font("Helvetica").text("Brand:", 40, currentY);
                doc.fillColor(primaryColor).font("Helvetica-Bold").text(order.brand.name, 70, currentY);
                currentY += 14;
            }

            // Divider
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor("#e9ecef").lineWidth(1).stroke();
            currentY += 8;

            // Items Table Header
            const tableLeft = 40;
            const tableWidth = 515;
            const colWidths = { sl: 25, product: 130, brand: 70, qty: 40, unit: 40, price: 70, discount: 65, net: 75 };

            // Table header background
            doc.fillColor(lightGray).rect(tableLeft, currentY, tableWidth, 16).fill();

            doc.fillColor(primaryColor).fontSize(7).font("Helvetica-Bold");
            let colX = tableLeft + 3;
            doc.text("SL", colX, currentY + 5);
            colX += colWidths.sl;
            doc.text("Product", colX, currentY + 5);
            colX += colWidths.product;
            doc.text("Brand", colX, currentY + 5);
            colX += colWidths.brand;
            doc.text("Qty", colX, currentY + 5, { width: colWidths.qty, align: "right" });
            colX += colWidths.qty;
            doc.text("Unit", colX, currentY + 5, { width: colWidths.unit, align: "center" });
            colX += colWidths.unit;
            doc.text("Price", colX, currentY + 5, { width: colWidths.price, align: "right" });
            colX += colWidths.price;
            doc.text("Discount", colX, currentY + 5, { width: colWidths.discount, align: "right" });
            colX += colWidths.discount;
            doc.text("Net", colX, currentY + 5, { width: colWidths.net, align: "right" });

            currentY += 18;

            // Table rows - Compact
            doc.font("Helvetica").fontSize(7);
            order.items.forEach((item, index) => {
                if (index % 2 === 0) {
                    doc.fillColor("#fafafa").rect(tableLeft, currentY - 1, tableWidth, 13).fill();
                }

                colX = tableLeft + 3;
                doc.fillColor(darkGray).text((index + 1).toString(), colX, currentY + 1);
                colX += colWidths.sl;
                doc.fillColor(primaryColor).text(truncateText(item.product?.name || "Unknown", 22), colX, currentY + 1);
                colX += colWidths.product;
                doc.fillColor(darkGray).text(truncateText(item.brand?.name || "-", 12), colX, currentY + 1);
                colX += colWidths.brand;
                doc.text(item.quantity.toString(), colX, currentY + 1, { width: colWidths.qty, align: "right" });
                colX += colWidths.qty;
                doc.text(item.unit, colX, currentY + 1, { width: colWidths.unit, align: "center" });
                colX += colWidths.unit;
                doc.text(formatCurrency(item.salePrice), colX, currentY + 1, { width: colWidths.price, align: "right" });
                colX += colWidths.price;
                doc.text(formatCurrency(item.discount), colX, currentY + 1, { width: colWidths.discount, align: "right" });
                colX += colWidths.discount;
                doc.fillColor(primaryColor).text(formatCurrency(item.net), colX, currentY + 1, { width: colWidths.net, align: "right" });

                currentY += 13;
            });

            // Table bottom border
            doc.moveTo(tableLeft, currentY + 2).lineTo(tableLeft + tableWidth, currentY + 2).strokeColor("#e9ecef").lineWidth(1).stroke();
            currentY += 15;

            // Financial Summary
            const summaryX = 390;
            const valueX = 485;

            doc.fillColor(darkGray).fontSize(9).font("Helvetica");
            doc.text("Subtotal:", summaryX, currentY);
            doc.fillColor(primaryColor).text(formatCurrency(order.subtotal), valueX, currentY, { width: 70, align: "right" });
            currentY += 14;

            doc.fillColor(darkGray).text("Discount:", summaryX, currentY);
            doc.fillColor("#dc3545").text("-" + formatCurrency(order.discount), valueX, currentY, { width: 70, align: "right" });
            currentY += 14;

            // Total with background
            doc.fillColor(accentColor).roundedRect(summaryX - 5, currentY - 2, 170, 20, 3).fill();
            doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold");
            doc.text("TOTAL:", summaryX, currentY + 2);
            doc.text(formatCurrency(order.total), valueX - 5, currentY + 2, { width: 75, align: "right" });

            currentY += 30;

            // Invoice Note
            if (order.invoiceNote) {
                doc.fillColor(darkGray).fontSize(8).font("Helvetica-Bold").text("Note:", 40, currentY);
                doc.fillColor(primaryColor).font("Helvetica").text(order.invoiceNote, 70, currentY, { width: 485 });
                currentY += 25;
            }

            // Footer - Right after content
            currentY += 20;
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor("#e9ecef").lineWidth(1).stroke();
            doc.fillColor(darkGray).fontSize(7).font("Helvetica")
                .text(`Generated on ${new Date().toLocaleString()}`, 40, currentY + 8, { align: "center", width: 515 });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(value: string | number): string {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return `Tk ${num.toFixed(2)}`;
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 2) + "..";
}
