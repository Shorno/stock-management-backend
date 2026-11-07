import { describe, expect, test } from "bun:test";
import {
    DEFAULT_SETTLEMENT_TEMPLATE,
    countSegments,
    daysSince,
    formatMoney,
    formatSmsDate,
    normalizeBdPhone,
    renderTemplate,
} from "../src/modules/sms/template";

describe("normalizeBdPhone", () => {
    test("accepts common Bangladeshi formats", () => {
        expect(normalizeBdPhone("01712345678")).toBe("8801712345678");
        expect(normalizeBdPhone("+880 1712-345678")).toBe("8801712345678");
        expect(normalizeBdPhone("8801712345678")).toBe("8801712345678");
        expect(normalizeBdPhone("00880 1712345678")).toBe("8801712345678");
        expect(normalizeBdPhone("০১৭১২৩৪৫৬৭৮")).toBe("8801712345678");
    });

    test("rejects invalid numbers", () => {
        expect(normalizeBdPhone(null)).toBeNull();
        expect(normalizeBdPhone("")).toBeNull();
        expect(normalizeBdPhone("0171234567")).toBeNull();
        expect(normalizeBdPhone("01212345678")).toBeNull();
        expect(normalizeBdPhone("—")).toBeNull();
    });
});

describe("renderTemplate", () => {
    test("fills placeholders and keeps unknown ones visible", () => {
        expect(renderTemplate("Hi {customer}, due ৳{totalDue} {oops}", { customer: "Rahim", totalDue: "1,500" }))
            .toBe("Hi Rahim, due ৳1,500 {oops}");
    });

    test("empty values collapse extra spaces", () => {
        expect(renderTemplate("{company}  Ltd {user}", { company: "", user: "" })).toBe("Ltd");
    });

    test("default settlement template has every value filled", () => {
        const text = renderTemplate(DEFAULT_SETTLEMENT_TEMPLATE, {
            customer: "আমি তরিকুল", date: "03/11/2026", currentDue: "1,810", previousDue: "110",
            totalDue: "1,920", user: "Mithun", company: "MS Tamim Enterprise",
        });
        expect(text).not.toMatch(/\{\w+\}/);
        expect(text).toContain("৳1,810");
        expect(text).toContain("MS Tamim Enterprise");
    });
});

describe("formatting", () => {
    test("money uses BD grouping and drops .00", () => {
        expect(formatMoney(1810)).toBe("1,810");
        expect(formatMoney("246733.02")).toBe("2,46,733.02");
        expect(formatMoney(1810.5)).toBe("1,810.50");
        expect(formatMoney(null)).toBe("0");
    });

    test("dates render as dd/MM/yyyy", () => {
        expect(formatSmsDate("2026-11-03")).toBe("03/11/2026");
        expect(formatSmsDate(new Date(2026, 0, 5))).toBe("05/01/2026");
        expect(formatSmsDate(null)).toBe("");
    });

    test("daysSince counts whole days", () => {
        expect(daysSince("2026-10-01", new Date(2026, 10, 7))).toBe(37);
        expect(daysSince(null)).toBeNull();
    });
});

describe("countSegments", () => {
    test("plain English uses GSM 160/153", () => {
        expect(countSegments("a".repeat(160))).toMatchObject({ encoding: "GSM", segments: 1 });
        expect(countSegments("a".repeat(161))).toMatchObject({ encoding: "GSM", segments: 2 });
    });

    test("Bangla uses Unicode 70/67", () => {
        expect(countSegments("ক".repeat(70))).toMatchObject({ encoding: "Unicode", segments: 1 });
        expect(countSegments("ক".repeat(71))).toMatchObject({ encoding: "Unicode", segments: 2 });
        expect(countSegments("৳").encoding).toBe("Unicode");
    });
});
