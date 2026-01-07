import PDFDocument from "pdfkit";
import type { DsrLedgerResponse } from "./service";

/**
 * Generate DSR Ledger PDF with Order Summary table
 */
export async function generateDsrLedgerPdf(ledgerData: DsrLedgerResponse): Promise<Buffer> {
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
            const black = "#000000";
            const darkGray = "#333333";
            const mediumGray = "#666666";
            const lightGray = "#e5e5e5";

            // === HEADER ===
            let currentY = 40;

            doc.fillColor(black)
                .fontSize(20)
                .font("Helvetica-Bold")
                .text("DSR LEDGER", 40, currentY);

            doc.fillColor(mediumGray)
                .fontSize(10)
                .font("Helvetica")
                .text(ledgerData.dsrName, 40, currentY + 26);

            // Date range on right
            doc.fillColor(mediumGray)
                .fontSize(9)
                .font("Helvetica")
                .text(`Generated: ${new Date().toLocaleDateString("en-BD")}`, 400, currentY, { align: "right" });

            currentY += 55;

            // Divider
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 15;

            // === SUMMARY BAR ===
            const summary = ledgerData.summary;
            doc.fontSize(9).font("Helvetica");

            const summaryItems = [
                { label: "Previous Due", value: parseFloat(summary.previousDue) },
                { label: "Total Sales", value: parseFloat(summary.totalSales) },
                { label: "Total Collected", value: parseFloat(summary.totalCollected), color: "#28a745" },
                { label: "Current Due", value: parseFloat(summary.currentDue), color: "#dc3545", bold: true },
            ];

            let summaryX = 40;
            summaryItems.forEach((item) => {
                doc.fillColor(mediumGray).font("Helvetica").text(item.label + ":", summaryX, currentY);
                doc.fillColor(item.color || darkGray)
                    .font(item.bold ? "Helvetica-Bold" : "Helvetica")
                    .text(`Tk ${item.value.toFixed(2)}`, summaryX + 80, currentY);
                summaryX += 130;
            });

            currentY += 25;

            // Divider
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 15;

            // === ORDER SUMMARY TABLE ===
            doc.fillColor(black).fontSize(12).font("Helvetica-Bold").text("Order Summary", 40, currentY);
            currentY += 20;

            const tableLeft = 40;
            const tableWidth = 515;
            const colWidths = { order: 60, date: 55, route: 70, netTotal: 65, payments: 65, expenses: 60, dues: 65, totalDue: 65 };

            // Table header
            doc.fillColor(darkGray).rect(tableLeft, currentY, tableWidth, 20).fill();

            doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold");
            let colX = tableLeft + 4;
            doc.text("Order #", colX, currentY + 6);
            colX += colWidths.order;
            doc.text("Date", colX, currentY + 6);
            colX += colWidths.date;
            doc.text("Route", colX, currentY + 6);
            colX += colWidths.route;
            doc.text("Net Total", colX, currentY + 6, { width: colWidths.netTotal, align: "right" });
            colX += colWidths.netTotal;
            doc.text("Payments", colX, currentY + 6, { width: colWidths.payments, align: "right" });
            colX += colWidths.payments;
            doc.text("Expenses", colX, currentY + 6, { width: colWidths.expenses, align: "right" });
            colX += colWidths.expenses;
            doc.text("Cust. Dues", colX, currentY + 6, { width: colWidths.dues, align: "right" });
            colX += colWidths.dues;
            doc.text("Total Due", colX, currentY + 6, { width: colWidths.totalDue, align: "right" });

            currentY += 22;

            // Table rows
            doc.font("Helvetica").fontSize(7);

            let grandTotalNetTotal = 0;
            let grandTotalPayments = 0;
            let grandTotalExpenses = 0;
            let grandTotalCustomerDue = 0;

            ledgerData.orders.forEach((order, index) => {
                // Check if we need a new page
                if (currentY > 750) {
                    doc.addPage();
                    currentY = 40;
                }

                if (index % 2 === 0) {
                    doc.fillColor("#f9f9f9").rect(tableLeft, currentY - 1, tableWidth, 16).fill();
                }

                const netTotal = parseFloat(order.netOrderTotal);
                const totalPayments = parseFloat(order.totalPayments);
                const totalExpenses = parseFloat(order.totalExpenses);
                const totalCustomerDue = parseFloat(order.totalCustomerDue);

                grandTotalNetTotal += netTotal;
                grandTotalPayments += totalPayments;
                grandTotalExpenses += totalExpenses;
                grandTotalCustomerDue += totalCustomerDue;

                colX = tableLeft + 4;
                doc.fillColor(darkGray).text(order.orderNumber, colX, currentY + 3);
                colX += colWidths.order;
                doc.fillColor(mediumGray).text(formatDate(order.orderDate), colX, currentY + 3);
                colX += colWidths.date;
                doc.fillColor(darkGray).text(truncateText(order.routeName, 12), colX, currentY + 3);
                colX += colWidths.route;
                doc.fillColor(darkGray).text(formatCurrency(netTotal), colX, currentY + 3, { width: colWidths.netTotal, align: "right" });
                colX += colWidths.netTotal;
                doc.fillColor("#28a745").text(formatCurrency(totalPayments), colX, currentY + 3, { width: colWidths.payments, align: "right" });
                colX += colWidths.payments;
                doc.fillColor(mediumGray).text(formatCurrency(totalExpenses), colX, currentY + 3, { width: colWidths.expenses, align: "right" });
                colX += colWidths.expenses;
                doc.fillColor("#e67e22").text(formatCurrency(totalCustomerDue), colX, currentY + 3, { width: colWidths.dues, align: "right" });
                colX += colWidths.dues;
                doc.fillColor(totalCustomerDue > 0 ? "#e67e22" : mediumGray)
                    .font("Helvetica-Bold")
                    .text(formatCurrency(totalCustomerDue), colX, currentY + 3, { width: colWidths.totalDue, align: "right" });
                doc.font("Helvetica");

                currentY += 16;
            });

            // Totals row
            doc.moveTo(tableLeft, currentY).lineTo(tableLeft + tableWidth, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            currentY += 3;
            doc.fillColor(darkGray).rect(tableLeft, currentY, tableWidth, 18).fill();

            doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold");
            colX = tableLeft + 4;
            doc.text("TOTAL", colX, currentY + 5);
            colX += colWidths.order + colWidths.date + colWidths.route;
            doc.text(formatCurrency(grandTotalNetTotal), colX, currentY + 5, { width: colWidths.netTotal, align: "right" });
            colX += colWidths.netTotal;
            doc.text(formatCurrency(grandTotalPayments), colX, currentY + 5, { width: colWidths.payments, align: "right" });
            colX += colWidths.payments;
            doc.text(formatCurrency(grandTotalExpenses), colX, currentY + 5, { width: colWidths.expenses, align: "right" });
            colX += colWidths.expenses;
            doc.text(formatCurrency(grandTotalCustomerDue), colX, currentY + 5, { width: colWidths.dues, align: "right" });
            colX += colWidths.dues;
            doc.text(formatCurrency(grandTotalCustomerDue), colX, currentY + 5, { width: colWidths.totalDue, align: "right" });

            currentY += 30;

            // === FOOTER ===
            doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightGray).lineWidth(1).stroke();
            doc.fillColor(mediumGray).fontSize(7).font("Helvetica")
                .text(`Generated on ${new Date().toLocaleString()}`, 40, currentY + 8, { align: "center", width: 515 });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-BD", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatCurrency(value: number): string {
    return value.toFixed(2);
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 2) + "..";
}
