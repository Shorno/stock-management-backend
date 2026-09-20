import type PDFDocument from "pdfkit";
import type { OrderWithItems } from "./types";

interface CompanySalesAdjustment {
    itemsWithCalculations: {
        id: number;
        returnQuantity: number;
        returnUnit: string;
        returnExtraPieces?: number;
        adjustmentDiscount: number;
    }[];
    damageReturns?: {
        orderItemId?: number;
        brandName: string;
        quantity: number;
        sellingPrice: number;
        unitPrice: number;
        isOther?: boolean;
    }[];
}

interface CompanySalesRow {
    name: string;
    totalOrder: number;
    returns: number;
    sales: number;
    damage: number;
    netSales: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const normalizeName = (name: string) => name.trim().toLowerCase();
const amounts = ["totalOrder", "returns", "sales", "damage", "netSales"] as const;

// Keep the same definition as the detail page's CompanyNetSalesSummary: company
// sales include item discounts, paid returns and settlement damage, before expenses/dues.
function companySalesRows(items: OrderWithItems["items"], adjustment: CompanySalesAdjustment | null | undefined, getMultiplier: (unit: string) => number) {
    const rows = new Map<string, CompanySalesRow>();
    const itemCompanies = new Map<number, string>();
    const companyNames = new Map<string, string>();
    const returnsByItem = new Map(adjustment?.itemsWithCalculations.map(item => [item.id, item]) ?? []);
    const ensureRow = (key: string, name: string) => {
        if (!rows.has(key)) rows.set(key, { name, totalOrder: 0, returns: 0, sales: 0, damage: 0, netSales: 0 });
        return rows.get(key)!;
    };

    for (const item of items) {
        const name = item.brand?.name || "Unassigned Company";
        const key = item.brand?.id ? `brand-${item.brand.id}` : `brand-name-${normalizeName(name)}`;
        const row = ensureRow(key, name);
        itemCompanies.set(item.id, key);
        companyNames.set(normalizeName(name), key);

        const returned = returnsByItem.get(item.id);
        const paidQuantity = Math.max(0, item.totalQuantity - item.freeQuantity);
        const initialNet = paidQuantity * Number(item.salePrice) - Number(item.discount);
        const returnPieces = (returned?.returnQuantity ?? 0) * getMultiplier(returned?.returnUnit || item.unit || "PCS")
            + (returned?.returnExtraPieces ?? 0);
        const deduction = returnPieces * Number(item.salePrice) + (returned?.adjustmentDiscount ?? 0);
        row.totalOrder += initialNet;
        row.returns += Math.max(0, Math.min(initialNet, deduction));
        row.sales += Math.max(0, initialNet - deduction);
    }

    for (const damage of adjustment?.damageReturns ?? []) {
        if (damage.isOther) continue;
        const linkedKey = damage.orderItemId ? itemCompanies.get(damage.orderItemId) : undefined;
        const name = (linkedKey && rows.get(linkedKey)?.name) || damage.brandName || "Unassigned Company";
        const normalized = normalizeName(name);
        const key = linkedKey || companyNames.get(normalized) || `damage-brand-${normalized}`;
        const row = ensureRow(key, name);
        row.damage += damage.quantity * (damage.sellingPrice || damage.unitPrice || 0);
    }

    return [...rows.values()].map(row => ({
        name: row.name, totalOrder: round2(row.totalOrder), returns: round2(row.returns),
        sales: round2(row.sales), damage: round2(row.damage), netSales: round2(row.sales - row.damage),
    })).sort((a, b) => b.netSales - a.netSales || a.name.localeCompare(b.name));
}

/** Render the company breakdown between the product table and financial summary. */
export function drawCompanySalesSummary(
    doc: InstanceType<typeof PDFDocument>, items: OrderWithItems["items"],
    adjustment: CompanySalesAdjustment | null | undefined, getMultiplier: (unit: string) => number,
    startY: number, pageBottom: number,
): number {
    const rows = companySalesRows(items, adjustment, getMultiplier);
    const totals: CompanySalesRow = { name: "Total", totalOrder: 0, returns: 0, sales: 0, damage: 0, netSales: 0 };
    for (const row of rows) for (const key of amounts) totals[key] = round2(totals[key] + row[key]);
    const widths = [155, 72, 72, 72, 72, 72];
    let y = startY + 14;

    const cells = (values: string[], top: number, bold: boolean) => {
        let x = 40;
        doc.font(bold ? "BanglaBold" : "BanglaRegular").fontSize(8).fillColor("#333333");
        values.forEach((value, index) => {
            const width = widths[index]!;
            doc.text(value, x + 5, top + 4, { width: width - 10, align: index === 0 ? "left" : "right" });
            x += width;
        });
    };
    const header = () => {
        doc.font("BanglaBold").fontSize(10).fillColor("#333333").text("Company Net Sales", 40, y, { width: 515 });
        y += 17;
        doc.font("BanglaRegular").fontSize(7).fillColor("#666666")
            .text("Returns include adjustment discounts. All amounts in BDT.", 40, y, { width: 515 });
        y += 16;
        doc.fillColor("#e5e5e5").rect(40, y, 515, 22).fill();
        cells(["Company", "Total Order", "Returns", "Sales", "Damage", "Net Sales"], y, true);
        y += 22;
    };
    const newPage = () => { doc.addPage(); y = 40; header(); };
    if (y + 100 > pageBottom) newPage();
    else header();

    const drawRow = (row: CompanySalesRow, total: boolean, reserve: number) => {
        const values = [row.name, ...amounts.map(key => row[key].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))];
        doc.font(total ? "BanglaBold" : "BanglaRegular").fontSize(8);
        const height = Math.max(22, ...values.map((value, index) => doc.heightOfString(value, { width: widths[index]! - 10 }) + 8));
        if (y + height + reserve > pageBottom) newPage();
        if (total) doc.fillColor("#f0f0f0").rect(40, y, 515, height).fill();
        cells(values, y, total);
        y += height;
        doc.moveTo(40, y).lineTo(555, y).strokeColor("#e5e5e5").lineWidth(0.5).stroke();
    };
    rows.forEach((row, index) => drawRow(row, false, index === rows.length - 1 ? 22 : 0));
    drawRow(totals, true, 0);
    return y;
}
