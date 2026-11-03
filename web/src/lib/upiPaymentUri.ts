import { BRANDING } from '../config/appContent';

/** Sanitize payee name for UPI `pn` parameter (shown in GPay / PhonePe / Paytm). */
export function sanitizeUpiPayeeName(name: string): string {
    const cleaned = name
        .trim()
        .replace(/[^\w\s.&'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 100);
    return cleaned || BRANDING.defaultMerchantDisplayName;
}

export function buildUpiPaymentUri(params: {
    vpa: string;
    payeeName: string;
    amount: number;
    note?: string;
}): string {
    const vpa = params.vpa.trim();
    const pn = sanitizeUpiPayeeName(params.payeeName);
    const am = params.amount.toFixed(2);
    const tn = params.note?.trim() || 'Bill Payment';
    return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(pn)}&am=${am}&cu=INR&tn=${encodeURIComponent(tn)}`;
}
