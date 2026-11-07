/**
 * Alpha SMS (sms.net.bd) API client.
 * Docs: https://portal.sms.net.bd/api
 *
 * Env:
 *   ALPHA_SMS_API_KEY   - required, from the Alpha SMS portal (API page)
 *   ALPHA_SMS_SENDER_ID - optional, an approved Sender ID
 *   ALPHA_SMS_BASE_URL  - optional, for local testing against a fake SMS server
 */

const BASE_URL = (process.env.ALPHA_SMS_BASE_URL?.trim() || "https://api.sms.net.bd").replace(/\/+$/, "");
const TIMEOUT_MS = 15_000;

const ERROR_MESSAGES: Record<number, string> = {
    400: "Missing or invalid parameter",
    403: "No permission to perform the request",
    404: "Resource not found",
    405: "Authorization required (check the API key)",
    409: "Unknown error on the SMS server",
    410: "SMS account expired",
    411: "Reseller account expired or suspended",
    412: "Invalid schedule",
    413: "Invalid Sender ID",
    414: "Message is empty",
    415: "Message is too long",
    416: "No valid number found",
    417: "Insufficient SMS balance",
    420: "Content blocked",
    421: "Only your registered number can receive SMS until the first balance recharge",
};

interface AlphaResponse<T> {
    error: number;
    msg: string;
    data?: T;
}

export interface SendResult {
    ok: boolean;
    requestId?: string;
    error?: string;
}

export function isSmsConfigured(): boolean {
    return Boolean(process.env.ALPHA_SMS_API_KEY?.trim());
}

function apiKey(): string {
    const key = process.env.ALPHA_SMS_API_KEY?.trim();
    if (!key) throw new Error("ALPHA_SMS_API_KEY is not set on the server");
    return key;
}

function describeError(res: AlphaResponse<unknown>): string {
    return ERROR_MESSAGES[res.error] ?? res.msg ?? `SMS API error ${res.error}`;
}

async function readJson<T>(response: Response): Promise<AlphaResponse<T>> {
    const text = await response.text();
    try {
        return JSON.parse(text) as AlphaResponse<T>;
    } catch {
        return { error: response.status || 409, msg: `Unexpected SMS API response (HTTP ${response.status})` };
    }
}

/** Send one message to one number (8801XXXXXXXXX). Never throws. */
export async function sendSms(to: string, message: string): Promise<SendResult> {
    try {
        const body = new URLSearchParams({ api_key: apiKey(), msg: message, to });
        const senderId = process.env.ALPHA_SMS_SENDER_ID?.trim();
        if (senderId) body.set("sender_id", senderId);

        const response = await fetch(`${BASE_URL}/sendsms`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const json = await readJson<{ request_id?: number | string }>(response);
        if (json.error !== 0) return { ok: false, error: describeError(json) };
        const requestId = json.data?.request_id;
        return { ok: true, requestId: requestId !== undefined ? String(requestId) : undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: message.includes("timed out") ? "SMS API timed out" : message };
    }
}

/** Account balance in BDT. Throws with a readable message on failure. */
export async function getBalance(): Promise<number> {
    const url = `${BASE_URL}/user/balance/?api_key=${encodeURIComponent(apiKey())}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = await readJson<{ balance?: string }>(response);
    if (json.error !== 0) throw new Error(describeError(json));
    return parseFloat(json.data?.balance ?? "0") || 0;
}

export interface DeliveryReport {
    requestId: string;
    status: string;
    charge: string;
    recipients: { number: string; charge: string; status: string }[];
}

/** Delivery report for a request id. Throws with a readable message on failure. */
export async function getReport(requestId: string): Promise<DeliveryReport> {
    const url = `${BASE_URL}/report/request/${encodeURIComponent(requestId)}/?api_key=${encodeURIComponent(apiKey())}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = await readJson<{
        request_id: number | string;
        request_status: string;
        request_charge: string;
        recipients?: { number: string; charge: string; status: string }[];
    }>(response);
    if (json.error !== 0 || !json.data) throw new Error(describeError(json));
    return {
        requestId: String(json.data.request_id),
        status: json.data.request_status,
        charge: json.data.request_charge,
        recipients: json.data.recipients ?? [],
    };
}
