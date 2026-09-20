import { afterEach, expect, mock, spyOn, test } from "bun:test";
import PDFDocument from "pdfkit";
import type { OrderWithItems } from "../src/modules/wholesale/types";
import type { AdjustmentData } from "../src/modules/wholesale/pdf.service";

// Exercise the real PDF generator and fonts with isolated units, never the configured database.
mock.module("../src/db/config", () => ({
    db: { select: () => ({ from: async () => [{ abbreviation: "PCS", multiplier: 1 }, { abbreviation: "BOX", multiplier: 12 }] }) },
}));
const { generateMainInvoicePdf } = await import("../src/modules/wholesale/pdf.service");

const now = new Date("2026-09-20T00:00:00Z");
const order: OrderWithItems = {
    id: 1, orderNumber: "QA-COMPANY-SALES", dsrId: 1, routeId: 1, orderDate: "2026-09-19",
    categoryId: null, brandId: null, invoiceNote: null, subtotal: "300", discount: "20", total: "280",
    paidAmount: "0", paymentStatus: "unpaid", status: "pending", createdAt: now, updatedAt: now,
    dsr: { id: 1, name: "Example DSR" }, route: { id: 1, name: "Example Route" },
    items: [1, 2].map(id => ({
        id, orderId: 1, productId: id, batchId: id, brandId: id, srId: null,
        quantity: 10, unit: "PCS", totalQuantity: 10, availableQuantity: 0, freeQuantity: 0, extraPieces: 0,
        deliveredQuantity: null, deliveredFreeQty: null, salePrice: String(id * 10), subtotal: String(id * 100),
        discount: "10", net: String(id * 100 - 10), createdAt: now, updatedAt: now,
        product: { id, name: `Product ${id}` }, brand: { id, name: id === 1 ? "Alpha Company" : "Beta Company" },
    })),
};

afterEach(() => { mock.restore(); });

const sectionText = (calls: unknown[][]) => {
    const printed = calls.map(call => String(call[0]));
    return printed.slice(printed.indexOf("Company Net Sales"), printed.indexOf("Payments Received"));
};

test("the full invoice includes the company sales section shown on the detail page", async () => {
    const text = spyOn(PDFDocument.prototype, "text");
    const pdf = await generateMainInvoicePdf(order);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.INVOICE_QA_PDF) await Bun.write(process.env.INVOICE_QA_PDF, pdf);
    const printed = text.mock.calls.map(call => String(call[0]));
    expect(printed).toContain("Company Net Sales");
    const companySection = sectionText(text.mock.calls);
    expect(companySection).toContain("Alpha Company");
    expect(companySection).toContain("Beta Company");
    expect(companySection).toContain("280.00");
});

test("company totals match the screen for unit returns, discounts, free pieces and settlement damage", async () => {
    const adjustedOrder: OrderWithItems = {
        ...order, status: "adjusted", total: "135", subtotal: "140", discount: "5",
        items: [
            { ...order.items[0]!, quantity: 2, unit: "BOX", totalQuantity: 26, freeQuantity: 1, extraPieces: 1, salePrice: "2", discount: "4", net: "46" },
            { ...order.items[1]!, brandId: 1, brand: order.items[0]!.brand, totalQuantity: 10, freeQuantity: 2, salePrice: "5", discount: "1", net: "39" },
            { ...order.items[1]!, id: 3, quantity: 5, totalQuantity: 5, salePrice: "10", discount: "0", net: "50" },
        ],
    };
    const adjustment: AdjustmentData = {
        payments: [], expenses: [], customerDues: [],
        itemsWithCalculations: adjustedOrder.items.map(item => ({
            ...item, productName: item.product!.name, brandName: item.brand!.name,
            returnQuantity: item.id === 3 ? 100 : 1, returnUnit: item.id === 1 ? "BOX" : "PCS",
            returnExtraPieces: item.id === 1 ? 1 : 0, returnFreeQuantity: 1, returnAmount: 0,
            adjustmentDiscount: item.id === 1 ? 3 : item.id === 2 ? 2 : 0,
            netQuantity: item.id === 1 ? 12 : item.id === 2 ? 7 : 0, netFreeQuantity: 0,
            netTotal: item.id === 1 ? 17 : item.id === 2 ? 32 : 0,
        })),
        damageReturns: [
            { orderItemId: 1, productName: "Linked damage", brandName: "Old company name", quantity: 2, sellingPrice: 3, unitPrice: 2 },
            { productName: "Unlinked damage", brandName: " alpha company ", quantity: 1, sellingPrice: 2, unitPrice: 1 },
            { orderItemId: 3, productName: "Beta damage", brandName: "Beta Company", quantity: 2, sellingPrice: 10, unitPrice: 5 },
            { productName: "Damage-only company", brandName: "Gamma Company", quantity: 3, sellingPrice: 0, unitPrice: 4 },
            { productName: "Other damage", brandName: "Excluded Company", quantity: 100, sellingPrice: 100, unitPrice: 50, isOther: true },
        ],
        summary: { subtotal: 140, discount: 5, total: 135, totalReturns: 81, totalAdjustmentDiscount: 5, netTotal: 9,
            totalPayments: 0, totalExpenses: 0, totalCustomerDues: 0, totalAdjustment: 0, due: 9 },
    };
    const text = spyOn(PDFDocument.prototype, "text");
    const pdf = await generateMainInvoicePdf(adjustedOrder, adjustment);
    if (process.env.INVOICE_QA_PDF) await Bun.write(process.env.INVOICE_QA_PDF.replace(".pdf", "-adjusted.pdf"), pdf);
    const printed = sectionText(text.mock.calls);
    const row = (name: string) => printed.slice(printed.indexOf(name), printed.indexOf(name) + 6);
    expect(row("Alpha Company")).toEqual(["Alpha Company", "85.00", "36.00", "49.00", "8.00", "41.00"]);
    expect(row("Beta Company")).toEqual(["Beta Company", "50.00", "50.00", "0.00", "20.00", "-20.00"]);
    expect(row("Gamma Company")).toEqual(["Gamma Company", "0.00", "0.00", "0.00", "12.00", "-12.00"]);
    expect(row("Total")).toEqual(["Total", "135.00", "86.00", "49.00", "40.00", "9.00"]);
    expect(printed).not.toContain("Excluded Company");
    expect(printed).not.toContain("Old company name");
});

test("long company lists continue onto new PDF pages with all companies and the total retained", async () => {
    const manyItems = Array.from({ length: 38 }, (_, index) => ({
        ...order.items[0]!, id: index + 1, brandId: index + 1,
        brand: { id: index + 1, name: index === 0 ? "বাংলা কোম্পানি - Long company name that must wrap within the company column without obscuring its sales" : `Company ${String(index + 1).padStart(2, "0")}` },
    }));
    const text = spyOn(PDFDocument.prototype, "text");
    const pdf = await generateMainInvoicePdf({ ...order, items: manyItems, total: "3420", subtotal: "3800", discount: "380" });
    if (process.env.INVOICE_QA_PDF) await Bun.write(process.env.INVOICE_QA_PDF.replace(".pdf", "-multipage.pdf"), pdf);
    const printed = sectionText(text.mock.calls);
    expect(printed.filter(value => value === "Company Net Sales").length).toBeGreaterThan(1);
    for (const item of manyItems) expect(printed.filter(value => value === item.brand.name)).toHaveLength(1);
    expect(printed.filter(value => value === "Total")).toHaveLength(1);
    expect(printed.slice(printed.indexOf("Total"), printed.indexOf("Total") + 6))
        .toEqual(["Total", "3,420.00", "0.00", "3,420.00", "0.00", "3,420.00"]);
});
