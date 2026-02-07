import PDFDocument from "pdfkit";
import path from "path";
import type { OrderWithItems } from "./types";

// Font paths for Bangla support
const FONTS_DIR = path.join(__dirname, "../../assets/fonts");
const FONT_REGULAR = path.join(FONTS_DIR, "HindSiliguri-Regular.ttf");
const FONT_BOLD = path.join(FONTS_DIR, "HindSiliguri-Bold.ttf");
const FONT_MEDIUM = path.join(FONTS_DIR, "HindSiliguri-Medium.ttf");

/**
 * Register Bangla fonts with PDFDocument
 */
function registerFonts(doc: typeof PDFDocument.prototype): void {
    doc.registerFont("BanglaRegular", FONT_REGULAR);
    doc.registerFont("BanglaBold", FONT_BOLD);
    doc.registerFont("BanglaMedium", FONT_MEDIUM);
}

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

            // Register Bangla fonts
            registerFonts(doc);

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
                .font("BanglaBold")
                .text("INVOICE", 40, 40);

            doc.fillColor(accentColor)
                .fontSize(9)
                .font("BanglaRegular")
                .text("WHOLESALE ORDER", 40, 68);

            // Order Info (right side)
            doc.fillColor(primaryColor)
                .fontSize(9)
                .font("BanglaBold")
                .text(`Invoice #: ${order.orderNumber}`, 350, 40, { align: "right" });

            doc.fillColor(darkGray)
                .fontSize(8)
                .font("BanglaRegular")
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
            doc.fillColor("#ffffff").fontSize(8).font("BanglaBold")
                .text(order.status.toUpperCase(), 470, 72, { width: 85, align: "center" });

            // Divider
            let currentY = 95;
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor("#e9ecef").lineWidth(1).stroke();
            currentY += 10;

            // DSR & Route Info - Single row
            doc.fontSize(8);
            doc.fillColor(darkGray).font("BanglaRegular").text("DSR:", 40, currentY);
            doc.fillColor(primaryColor).font("BanglaBold").text(order.dsr?.name || "N/A", 65, currentY);

            doc.fillColor(darkGray).font("BanglaRegular").text("Route:", 200, currentY);
            doc.fillColor(primaryColor).font("BanglaBold").text(order.route?.name || "N/A", 235, currentY);

            if (order.category) {
                doc.fillColor(darkGray).font("BanglaRegular").text("Category:", 350, currentY);
                doc.fillColor(primaryColor).font("BanglaBold").text(order.category.name, 400, currentY);
            }

            currentY += 14;

            if (order.brand) {
                doc.fillColor(darkGray).font("BanglaRegular").text("Brand:", 40, currentY);
                doc.fillColor(primaryColor).font("BanglaBold").text(order.brand.name, 70, currentY);
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

            doc.fillColor(primaryColor).fontSize(7).font("BanglaBold");
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
            doc.font("BanglaRegular").fontSize(7);
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

            doc.fillColor(darkGray).fontSize(9).font("BanglaRegular");
            doc.text("Subtotal:", summaryX, currentY);
            doc.fillColor(primaryColor).text(formatCurrency(order.subtotal), valueX, currentY, { width: 70, align: "right" });
            currentY += 14;

            doc.fillColor(darkGray).text("Discount:", summaryX, currentY);
            doc.fillColor("#dc3545").text("-" + formatCurrency(order.discount), valueX, currentY, { width: 70, align: "right" });
            currentY += 14;

            // Total with background
            doc.fillColor(accentColor).roundedRect(summaryX - 5, currentY - 2, 170, 20, 3).fill();
            doc.fillColor("#ffffff").fontSize(10).font("BanglaBold");
            doc.text("TOTAL:", summaryX, currentY + 2);
            doc.text(formatCurrency(order.total), valueX - 5, currentY + 2, { width: 75, align: "right" });

            currentY += 30;

            // Invoice Note
            if (order.invoiceNote) {
                doc.fillColor(darkGray).fontSize(8).font("BanglaBold").text("Note:", 40, currentY);
                doc.fillColor(primaryColor).font("BanglaRegular").text(order.invoiceNote, 70, currentY, { width: 485 });
                currentY += 25;
            }

            // Footer - Right after content
            currentY += 20;
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor("#e9ecef").lineWidth(1).stroke();
            doc.fillColor(darkGray).fontSize(7).font("BanglaRegular")
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

// Types for adjustment data
interface AdjustmentPayment {
    id?: number;
    amount: number;
    method: string;
}

interface AdjustmentExpense {
    id?: number;
    amount: number;
    type: string;
}

interface AdjustmentCustomerDue {
    id?: number;
    customerName: string;
    amount: number;
}

interface DamageReturn {
    id?: number;
    productName: string;
    variantName?: string;
    brandName: string;
    quantity: number;
    unitPrice: number;
    sellingPrice: number;
    reason?: string;
}

interface AdjustmentItemWithCalculations {
    id: number;
    productId: number;
    productName: string;
    brandId: number;
    brandName: string;
    quantity: number;
    unit: string;
    freeQuantity: number;
    salePrice: string;
    discount: string;
    net: string;
    returnQuantity: number;
    returnUnit: string;
    returnFreeQuantity: number;
    returnAmount: number;
    adjustmentDiscount: number;  // Per-item adjustment discount
    netQuantity: number;
    netFreeQuantity: number;
    netTotal: number;
}

interface AdjustmentSummary {
    subtotal: number;
    discount: number;
    total: number;
    totalReturns: number;
    totalAdjustmentDiscount: number;  // Total adjustment discount across all items
    netTotal: number;
    totalPayments: number;
    totalExpenses: number;
    totalCustomerDues: number;
    totalAdjustment: number;
    due: number;
}

export interface AdjustmentData {
    payments: AdjustmentPayment[];
    expenses: AdjustmentExpense[];
    customerDues: AdjustmentCustomerDue[];
    damageReturns?: DamageReturn[];
    itemsWithCalculations: AdjustmentItemWithCalculations[];
    summary: AdjustmentSummary;
}

/**
 * Generate a simple Sales Invoice PDF (Product list with qty and free qty only)
 */
export async function generateSalesInvoicePdf(order: OrderWithItems, adjustment?: AdjustmentData | null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "A4",
                margin: 40,
                autoFirstPage: true,
            });

            // Register Bangla fonts
            registerFonts(doc);

            const chunks: Buffer[] = [];
            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);

            // Colors - Minimalist palette
            const black = "#000000";
            const darkGray = "#333333";
            const mediumGray = "#666666";
            const lightGray = "#e5e5e5";

            // === HEADER ===
            let currentY = 40;

            // Company name
            doc.fillColor(black)
                .fontSize(18)
                .font("BanglaBold")
                .text("Algoverse", 40, currentY);

            doc.fillColor(mediumGray)
                .fontSize(8)
                .font("BanglaRegular")
                .text("contact@algoverse.com | algoverse.com", 40, currentY + 22);

            // Invoice title (right side)
            doc.fillColor(black)
                .fontSize(14)
                .font("BanglaBold")
                .text("SALES INVOICE", 400, currentY, { align: "right" });

            doc.fillColor(mediumGray)
                .fontSize(9)
                .font("BanglaRegular")
                .text(`#${order.orderNumber}`, 400, currentY + 18, { align: "right" })
                .text(formatDate(order.orderDate), 400, currentY + 30, { align: "right" });

            currentY += 55;

            // Divider
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 15;

            // Order Info - DSR & Route
            doc.fontSize(9).font("BanglaRegular");
            doc.fillColor(mediumGray).text("DSR:", 40, currentY);
            doc.fillColor(darkGray).font("BanglaBold").text(order.dsr?.name || "N/A", 70, currentY);

            doc.fillColor(mediumGray).font("BanglaRegular").text("Route:", 250, currentY);
            doc.fillColor(darkGray).font("BanglaBold").text(order.route?.name || "N/A", 290, currentY);

            currentY += 25;

            // Divider
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 15;

            // === ITEMS TABLE ===
            const tableLeft = 40;
            const tableWidth = 515;
            const colWidths = { sl: 25, product: 160, brand: 100, qty: 55, unit: 45, free: 55 };

            // Table header
            doc.fillColor(darkGray).rect(tableLeft, currentY, tableWidth, 22).fill();

            doc.fillColor("#ffffff").fontSize(9).font("BanglaBold");
            let colX = tableLeft + 8;
            doc.text("SL", colX, currentY + 6);
            colX += colWidths.sl;
            doc.text("Product", colX, currentY + 6);
            colX += colWidths.product;
            doc.text("Brand", colX, currentY + 6);
            colX += colWidths.brand;
            doc.text("Qty", colX, currentY + 6, { width: colWidths.qty, align: "right" });
            colX += colWidths.qty;
            doc.text("Unit", colX, currentY + 6, { width: colWidths.unit, align: "center" });
            colX += colWidths.unit;
            doc.text("Free Qty", colX, currentY + 6, { width: colWidths.free, align: "right" });

            currentY += 24;

            // Use adjustment items if available, otherwise use order items
            const items = adjustment?.itemsWithCalculations || order.items.map(item => ({
                productName: item.product?.name || "Unknown",
                brandName: item.brand?.name || "-",
                netQuantity: item.quantity,
                unit: item.unit,
                netFreeQuantity: item.freeQuantity,
            }));

            // Table rows
            doc.font("BanglaRegular").fontSize(9);
            let totalQty = 0;
            let totalFree = 0;

            items.forEach((item, index) => {
                if (index % 2 === 0) {
                    doc.fillColor("#f9f9f9").rect(tableLeft, currentY - 2, tableWidth, 20).fill();
                }

                const qty = "netQuantity" in item ? item.netQuantity : (item as any).quantity || 0;
                const freeQty = "netFreeQuantity" in item ? item.netFreeQuantity : (item as any).freeQuantity || 0;
                totalQty += qty;
                totalFree += freeQty;

                colX = tableLeft + 8;
                doc.fillColor(mediumGray).text((index + 1).toString(), colX, currentY + 3);
                colX += colWidths.sl;
                doc.fillColor(darkGray).text(truncateText(item.productName || (item as any).product?.name || "Unknown", 28), colX, currentY + 3);
                colX += colWidths.product;
                doc.fillColor(mediumGray).text(truncateText(item.brandName || (item as any).brand?.name || "-", 18), colX, currentY + 3);
                colX += colWidths.brand;
                doc.fillColor(darkGray).text(qty.toString(), colX, currentY + 3, { width: colWidths.qty, align: "right" });
                colX += colWidths.qty;
                doc.fillColor(mediumGray).text(item.unit, colX, currentY + 3, { width: colWidths.unit, align: "center" });
                colX += colWidths.unit;
                doc.fillColor(darkGray).text(freeQty.toString(), colX, currentY + 3, { width: colWidths.free, align: "right" });

                currentY += 20;
            });

            // Total row
            doc.moveTo(tableLeft, currentY).lineTo(tableLeft + tableWidth, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 5;

            doc.fillColor(darkGray).rect(tableLeft, currentY, tableWidth, 22).fill();
            doc.fillColor("#ffffff").fontSize(9).font("BanglaBold");
            colX = tableLeft + 8;
            doc.text("TOTAL", colX, currentY + 6);
            colX = tableLeft + colWidths.sl + colWidths.product + colWidths.brand + 8;
            doc.text(totalQty.toString(), colX, currentY + 6, { width: colWidths.qty, align: "right" });
            colX += colWidths.qty + colWidths.unit;
            doc.text(totalFree.toString(), colX, currentY + 6, { width: colWidths.free, align: "right" });

            currentY += 35;

            // === FOOTER ===
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            doc.fillColor(mediumGray).fontSize(7).font("BanglaRegular")
                .text(`Generated on ${new Date().toLocaleString()}`, 40, currentY + 8, { align: "center", width: 515 });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Generate a detailed Main Invoice PDF (with discounts, subtotals, and adjustments)
 */
export async function generateMainInvoicePdf(order: OrderWithItems, adjustment?: AdjustmentData | null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "A4",
                margin: 40,
                autoFirstPage: true,
            });

            // Register Bangla fonts
            registerFonts(doc);

            const chunks: Buffer[] = [];
            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);

            // Colors - Minimalist palette
            const black = "#000000";
            const darkGray = "#333333";
            const mediumGray = "#666666";
            const lightGray = "#e5e5e5";

            // === HEADER ===
            let currentY = 40;

            // Company name
            doc.fillColor(black)
                .fontSize(18)
                .font("BanglaBold")
                .text("Algoverse", 40, currentY);

            doc.fillColor(mediumGray)
                .fontSize(8)
                .font("BanglaRegular")
                .text("contact@algoverse.com | algoverse.com", 40, currentY + 22);

            // Invoice title (right side)
            doc.fillColor(black)
                .fontSize(14)
                .font("BanglaBold")
                .text("INVOICE", 400, currentY, { align: "right" });

            doc.fillColor(mediumGray)
                .fontSize(9)
                .font("BanglaRegular")
                .text(`#${order.orderNumber}`, 400, currentY + 18, { align: "right" })
                .text(formatDate(order.orderDate), 400, currentY + 30, { align: "right" });

            currentY += 55;

            // Divider
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 15;

            // Order Info - DSR & Route
            doc.fontSize(9).font("BanglaRegular");
            doc.fillColor(mediumGray).text("DSR:", 40, currentY);
            doc.fillColor(darkGray).font("BanglaBold").text(order.dsr?.name || "N/A", 70, currentY);

            doc.fillColor(mediumGray).font("BanglaRegular").text("Route:", 250, currentY);
            doc.fillColor(darkGray).font("BanglaBold").text(order.route?.name || "N/A", 290, currentY);

            currentY += 25;

            // Divider
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 15;

            // === ITEMS TABLE ===
            const tableLeft = 40;
            const tableWidth = 515;
            const colWidths = { sl: 20, product: 100, brand: 60, qty: 30, free: 28, price: 50, disc: 45, subtotal: 55, retQty: 30, netTotal: 50 };

            // Table header
            doc.fillColor(darkGray).rect(tableLeft, currentY, tableWidth, 22).fill();

            doc.fillColor("#ffffff").fontSize(7).font("BanglaBold");
            let colX = tableLeft + 4;
            doc.text("SL", colX, currentY + 7);
            colX += colWidths.sl;
            doc.text("Product", colX, currentY + 7);
            colX += colWidths.product;
            doc.text("Brand", colX, currentY + 7);
            colX += colWidths.brand;
            doc.text("Qty", colX, currentY + 7, { width: colWidths.qty, align: "right" });
            colX += colWidths.qty;
            doc.text("Free", colX, currentY + 7, { width: colWidths.free, align: "right" });
            colX += colWidths.free;
            doc.text("Price", colX, currentY + 7, { width: colWidths.price, align: "right" });
            colX += colWidths.price;
            doc.text("Disc", colX, currentY + 7, { width: colWidths.disc, align: "right" });
            colX += colWidths.disc;
            doc.text("Subtotal", colX, currentY + 7, { width: colWidths.subtotal, align: "right" });
            colX += colWidths.subtotal;
            doc.text("Ret", colX, currentY + 7, { width: colWidths.retQty, align: "right" });
            colX += colWidths.retQty;
            doc.text("Net", colX, currentY + 7, { width: colWidths.netTotal, align: "right" });

            currentY += 24;

            // Use adjustment items if available, otherwise use order items
            const items = adjustment?.itemsWithCalculations || order.items.map(item => ({
                productName: item.product?.name || "Unknown",
                brandName: item.brand?.name || "-",
                quantity: item.quantity,
                unit: item.unit,
                freeQuantity: item.freeQuantity,
                salePrice: item.salePrice,
                discount: item.discount,
                net: item.net,
                returnQuantity: 0,
                netTotal: parseFloat(item.net),
            }));

            // Table rows
            doc.font("BanglaRegular").fontSize(7);

            items.forEach((item, index) => {
                if (index % 2 === 0) {
                    doc.fillColor("#f9f9f9").rect(tableLeft, currentY - 2, tableWidth, 18).fill();
                }

                colX = tableLeft + 4;
                doc.fillColor(mediumGray).text((index + 1).toString(), colX, currentY + 3);
                colX += colWidths.sl;
                doc.fillColor(darkGray).text(truncateText(item.productName, 18), colX, currentY + 3);
                colX += colWidths.product;
                doc.fillColor(mediumGray).text(truncateText(item.brandName, 11), colX, currentY + 3);
                colX += colWidths.brand;
                doc.fillColor(darkGray).text(`${item.quantity}`, colX, currentY + 3, { width: colWidths.qty, align: "right" });
                colX += colWidths.qty;
                doc.text(`${item.freeQuantity}`, colX, currentY + 3, { width: colWidths.free, align: "right" });
                colX += colWidths.free;
                doc.text(formatCurrencyShort(item.salePrice), colX, currentY + 3, { width: colWidths.price, align: "right" });
                colX += colWidths.price;
                doc.fillColor(mediumGray).text(formatCurrencyShort(item.discount), colX, currentY + 3, { width: colWidths.disc, align: "right" });
                colX += colWidths.disc;
                doc.fillColor(darkGray).text(formatCurrencyShort(item.net), colX, currentY + 3, { width: colWidths.subtotal, align: "right" });
                colX += colWidths.subtotal;
                const retQty = "returnQuantity" in item ? item.returnQuantity : 0;
                doc.fillColor(retQty > 0 ? "#dc3545" : mediumGray).text(retQty.toString(), colX, currentY + 3, { width: colWidths.retQty, align: "right" });
                colX += colWidths.retQty;
                doc.fillColor(black).font("BanglaBold").text(formatCurrencyShort(item.netTotal), colX, currentY + 3, { width: colWidths.netTotal, align: "right" });
                doc.font("BanglaRegular");

                currentY += 18;
            });

            // Table bottom border
            doc.moveTo(tableLeft, currentY).lineTo(tableLeft + tableWidth, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 20;

            // === FINANCIAL SUMMARY ===
            const summaryData = adjustment?.summary || {
                subtotal: order.items.reduce((sum, item) => sum + parseFloat(item.net), 0),
                discount: parseFloat(order.discount),
                total: parseFloat(order.total),
                totalReturns: 0,
                totalAdjustmentDiscount: 0,
                netTotal: parseFloat(order.total),
                totalPayments: parseFloat(order.paidAmount),
                totalExpenses: 0,
                totalCustomerDues: 0,
                totalAdjustment: parseFloat(order.paidAmount),
                due: parseFloat(order.total) - parseFloat(order.paidAmount),
            };

            // Two column layout for summary
            const leftCol = 40;
            const rightCol = 320;
            const labelWidth = 120;
            const valueWidth = 80;

            // Left column - Payments & Expenses
            doc.fontSize(9).font("BanglaBold").fillColor(darkGray);
            doc.text("Payments Received", leftCol, currentY);
            currentY += 14;

            doc.fontSize(8).font("BanglaRegular");
            if (adjustment?.payments && adjustment.payments.length > 0) {
                adjustment.payments.forEach(payment => {
                    doc.fillColor(mediumGray).text(payment.method || "Cash", leftCol, currentY);
                    doc.fillColor(darkGray).text(formatCurrency(payment.amount), leftCol + 100, currentY);
                    currentY += 12;
                });
            } else {
                doc.fillColor(mediumGray).text("No payments", leftCol, currentY);
                currentY += 12;
            }

            const paymentEndY = currentY;
            currentY += 8;

            doc.font("BanglaBold").fillColor(darkGray);
            doc.text("Expenses", leftCol, currentY);
            currentY += 14;

            doc.fontSize(8).font("BanglaRegular");
            if (adjustment?.expenses && adjustment.expenses.length > 0) {
                adjustment.expenses.forEach(expense => {
                    doc.fillColor(mediumGray).text(expense.type.replace("_", " "), leftCol, currentY);
                    doc.fillColor(darkGray).text(formatCurrency(expense.amount), leftCol + 100, currentY);
                    currentY += 12;
                });
            } else {
                doc.fillColor(mediumGray).text("No expenses", leftCol, currentY);
                currentY += 12;
            }

            currentY += 8;

            // Left column: Customer Dues (NEW)
            doc.font("BanglaBold").fillColor(darkGray);
            doc.text("Customer Dues", leftCol, currentY);
            currentY += 14;

            doc.fontSize(8).font("BanglaRegular");
            if (adjustment?.customerDues && adjustment.customerDues.length > 0) {
                adjustment.customerDues.forEach(due => {
                    doc.fillColor(mediumGray).text(truncateText(due.customerName, 25), leftCol, currentY);
                    doc.fillColor(darkGray).text(formatCurrency(due.amount), leftCol + 100, currentY);
                    currentY += 12;
                });
            } else {
                doc.fillColor(mediumGray).text("No customer dues", leftCol, currentY);
                currentY += 12;
            }

            currentY += 8;

            // Left column: Damage Returns (NEW)
            if (adjustment?.damageReturns && adjustment.damageReturns.length > 0) {
                doc.font("BanglaBold").fillColor("#dc3545");
                doc.text("Damage Returns", leftCol, currentY);
                currentY += 14;

                doc.fontSize(8).font("BanglaRegular");
                let totalDamage = 0;
                let totalLostMargin = 0;
                adjustment.damageReturns.forEach(item => {
                    // Settlement uses selling price
                    const itemTotal = item.quantity * (item.sellingPrice || item.unitPrice);
                    // Lost profit margin = (sellingPrice - buyingPrice) Ã— qty
                    const lostMargin = item.quantity * ((item.sellingPrice || item.unitPrice) - item.unitPrice);
                    totalDamage += itemTotal;
                    totalLostMargin += lostMargin;
                    const label = item.variantName
                        ? `${truncateText(item.productName, 15)} (${item.variantName}) x${item.quantity}`
                        : `${truncateText(item.productName, 20)} x${item.quantity}`;
                    doc.fillColor(mediumGray).text(label, leftCol, currentY);
                    doc.fillColor("#dc3545").text(formatCurrency(itemTotal), leftCol + 130, currentY);
                    currentY += 12;
                });
                // Total damage line
                doc.fillColor("#dc3545").font("BanglaBold");
                doc.text("Total:", leftCol, currentY);
                doc.text(formatCurrency(totalDamage), leftCol + 130, currentY);
                currentY += 14;
                // Lost profit margin note
                doc.fillColor("#e67e22").fontSize(7).font("BanglaRegular");
                doc.text(`P&L Impact: -${formatCurrency(totalLostMargin)} (lost margin)`, leftCol, currentY);
                currentY += 16;
            }


            // Right column - Summary totals (positioned at same Y as payments started)
            let rightY = paymentEndY - (adjustment?.payments?.length || 1) * 12 - 14;

            doc.fontSize(9);
            const summaryItems = [
                { label: "Subtotal", value: summaryData.subtotal, bold: false },
                { label: "Discount", value: -summaryData.discount, bold: false, color: "#dc3545" },
                { label: "Total", value: summaryData.total, bold: true },
                { label: "Returns", value: -summaryData.totalReturns, bold: false, color: "#dc3545" },
                { label: "Adj. Discount", value: -(summaryData.totalAdjustmentDiscount || 0), bold: false, color: "#dc3545" },
                { label: "Net Total", value: summaryData.netTotal, bold: true },
                { label: "Payments", value: -summaryData.totalPayments, bold: false, color: "#28a745" },
                { label: "Expenses", value: -summaryData.totalExpenses, bold: false, color: "#dc3545" },
                { label: "Cust. Dues", value: -summaryData.totalCustomerDues, bold: false, color: "#e67e22" },
            ];

            summaryItems.forEach(item => {
                doc.font(item.bold ? "BanglaBold" : "BanglaRegular").fillColor(mediumGray);
                doc.text(item.label, rightCol, rightY);
                doc.fillColor(item.color || darkGray);
                doc.text(formatCurrency(Math.abs(item.value)), rightCol + labelWidth, rightY, { width: valueWidth, align: "right" });
                rightY += 14;
            });

            // Due amount (highlighted)
            rightY += 5;
            doc.fillColor(black).rect(rightCol - 5, rightY - 3, labelWidth + valueWidth + 15, 22).fill();
            doc.fillColor("#ffffff").fontSize(10).font("BanglaBold");
            doc.text("DUE", rightCol, rightY + 2);
            doc.text(formatCurrency(summaryData.due), rightCol + labelWidth, rightY + 2, { width: valueWidth, align: "right" });

            // === AMOUNT TO COLLECT (for DSR) - Left side, prominent display ===
            const collectY = Math.max(currentY, rightY) + 20;

            // Amount to collect = total customer dues (what DSR should collect from customers)
            const amountToCollect = summaryData.totalCustomerDues;

            doc.fillColor("#1a5f2a").fontSize(9).font("BanglaBold");
            doc.text("AMOUNT TO COLLECT", leftCol, collectY);

            doc.fillColor("#1a5f2a").fontSize(22).font("BanglaBold");
            doc.text(formatCurrency(amountToCollect), leftCol, collectY + 14);

            doc.fillColor(mediumGray).fontSize(8).font("BanglaRegular");
            doc.text("(To be collected by DSR from customers)", leftCol, collectY + 40);

            // === FOOTER ===
            const footerY = collectY + 60;
            doc.moveTo(40, footerY).lineTo(555, footerY).strokeColor(lightGray).lineWidth(1).stroke();
            doc.fillColor(mediumGray).fontSize(7).font("BanglaRegular")
                .text(`Generated on ${new Date().toLocaleString()}`, 40, footerY + 8, { align: "center", width: 515 });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

function formatCurrencyShort(value: string | number): string {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return num.toFixed(2);
}

