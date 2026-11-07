/**
 * Pure helpers for SMS text: placeholder rendering, Bangladesh phone
 * normalization, money/date formatting and SMS segment counting.
 */

export const SMS_PLACEHOLDERS = [
    { key: "company", label: "Company name" },
    { key: "customer", label: "Customer (shop owner) name" },
    { key: "shop", label: "Shop name" },
    { key: "date", label: "Challan / collection date" },
    { key: "orderNo", label: "Challan number" },
    { key: "currentDue", label: "Due on this challan" },
    { key: "previousDue", label: "Previous due (before this challan / collection)" },
    { key: "totalDue", label: "Total outstanding due" },
    { key: "collected", label: "Amount collected" },
    { key: "remainingDue", label: "Due remaining after collection" },
    { key: "oldestDueDate", label: "Date of the oldest unpaid due" },
    { key: "days", label: "Days since the oldest unpaid due" },
    { key: "user", label: "Name of the user sending / completing it" },
] as const;

export type SmsPlaceholder = (typeof SMS_PLACEHOLDERS)[number]["key"];
export type SmsVariables = Partial<Record<SmsPlaceholder, string | number | null | undefined>>;

export const DEFAULT_SETTLEMENT_TEMPLATE =
    "প্রিয় {customer}, {date} তারিখের চালানে আপনার বাকি ৳{currentDue}। পূর্বের বাকি ৳{previousDue}, মোট বাকি ৳{totalDue}। হিসাব করেছেন: {user}। {company}";

export const DEFAULT_COLLECTION_TEMPLATE =
    "প্রিয় {customer}, {date} তারিখে ৳{collected} বাকি পরিশোধ গ্রহণ করা হয়েছে। পূর্বের বাকি ৳{previousDue}, বর্তমান বাকি ৳{remainingDue}। গ্রহণ করেছেন: {user}। {company}";

export const DEFAULT_REMINDER_TEMPLATE =
    "প্রিয় {customer}, {oldestDueDate} থেকে আপনার মোট বাকি ৳{totalDue}। অনুগ্রহ করে দ্রুত পরিশোধ করুন। {user}, {company}";

/** Replace {placeholder} tokens. Unknown tokens are left as-is so typos are visible. */
export function renderTemplate(template: string, vars: SmsVariables): string {
    return template
        .replace(/\{(\w+)\}/g, (match, key: string) => {
            if (!(key in vars)) return match;
            const value = vars[key as SmsPlaceholder];
            return value === null || value === undefined ? "" : String(value);
        })
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

/** 1810 -> "1,810", 1810.5 -> "1,810.50" (Indian/Bangladeshi digit grouping). */
export function formatMoney(value: number | string | null | undefined): string {
    const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
    const safe = Number.isFinite(n) ? Math.round((n as number) * 100) / 100 : 0;
    const isWhole = Number.isInteger(safe);
    return safe.toLocaleString("en-IN", {
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

/** "2026-11-03" (or a Date) -> "03/11/2026" */
export function formatSmsDate(value: string | Date | null | undefined): string {
    if (!value) return "";
    if (typeof value === "string") {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        value = new Date(value);
    }
    if (Number.isNaN(value.getTime())) return "";
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${value.getFullYear()}`;
}

/** Whole days between an ISO date (yyyy-mm-dd) and `today`. */
export function daysSince(isoDate: string | null | undefined, today: Date = new Date()): number | null {
    if (!isoDate) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
    if (!m) return null;
    const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/**
 * Normalize a Bangladeshi mobile number to 8801XXXXXXXXX.
 * Accepts 01XXXXXXXXX, 8801XXXXXXXXX, +8801XXXXXXXXX, with spaces/dashes and Bangla digits.
 * Returns null when it is not a valid BD mobile number.
 */
export function normalizeBdPhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const asciiDigits = raw.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
    let digits = asciiDigits.replace(/\D/g, "");
    if (digits.startsWith("00880")) digits = digits.slice(2);
    if (digits.startsWith("01") && digits.length === 11) digits = `88${digits}`;
    if (digits.startsWith("1") && digits.length === 10) digits = `880${digits}`;
    return /^8801[3-9]\d{8}$/.test(digits) ? digits : null;
}

// GSM 03.38 basic character set + extension table characters
const GSM_BASIC =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

export interface SegmentInfo {
    encoding: "GSM" | "Unicode";
    length: number;
    segments: number;
    perSegment: number;
}

/** How many SMS parts a message will be billed as. Bangla text is Unicode (70 / 67 chars). */
export function countSegments(text: string): SegmentInfo {
    const chars = Array.from(text);
    const isGsm = chars.every((ch) => GSM_BASIC.includes(ch) || GSM_EXTENDED.includes(ch));
    if (isGsm) {
        const length = chars.reduce((n, ch) => n + (GSM_EXTENDED.includes(ch) ? 2 : 1), 0);
        const perSegment = length <= 160 ? 160 : 153;
        return { encoding: "GSM", length, segments: length === 0 ? 0 : Math.ceil(length / perSegment), perSegment };
    }
    // UCS-2 counts UTF-16 code units
    const length = text.length;
    const perSegment = length <= 70 ? 70 : 67;
    return { encoding: "Unicode", length, segments: length === 0 ? 0 : Math.ceil(length / perSegment), perSegment };
}
