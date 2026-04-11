/** One modal per browser tab session; cleared on logout so next login can nudge again. */
const STOCK_ALERT_POPUP_SESSION_KEY = 'medpos_stock_alert_popup_shown_session';

export function shouldShowStockAlertPopup(): boolean {
    try {
        return sessionStorage.getItem(STOCK_ALERT_POPUP_SESSION_KEY) !== '1';
    } catch {
        return true;
    }
}

export function markStockAlertPopupShown(): void {
    try {
        sessionStorage.setItem(STOCK_ALERT_POPUP_SESSION_KEY, '1');
    } catch {
        /* private mode / unavailable */
    }
}

export function clearStockAlertPopupSession(): void {
    try {
        sessionStorage.removeItem(STOCK_ALERT_POPUP_SESSION_KEY);
    } catch {
        /* ignore */
    }
}
