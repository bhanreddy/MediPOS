import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { uiSlice } from '../state/slices';
import { InventoryAlertService } from '../services/inventoryAlertService';
import { markStockAlertPopupShown, shouldShowStockAlertPopup } from '../utils/stockAlertSession';
import { STOCK_ALERT_POPUP_COPY } from '../config/appContent';

const POLL_MS = 5 * 60 * 1000;

/**
 * Updates header badge counts on a schedule.
 * The blocking popup runs at most once per tab session (on first check with issues), never on each poll — avoids repeated alerts when remounts reset refs or Strict Mode runs twice.
 */
export function useGlobalAlerts(enabled: boolean) {
    const dispatch = useDispatch();

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        const run = async (allowPopup: boolean) => {
            try {
                const { expiry, lowStock } = await InventoryAlertService.getCounts();
                if (cancelled) return;
                dispatch(uiSlice.actions.setStockAlerts({ expiry, lowStock }));

                if (!allowPopup) return;

                const hasIssue = expiry > 0 || lowStock > 0;
                if (!hasIssue || !shouldShowStockAlertPopup()) return;

                markStockAlertPopupShown();
                dispatch(uiSlice.actions.markAlertToast(Date.now()));
                const parts: string[] = [];
                if (expiry) parts.push(STOCK_ALERT_POPUP_COPY.batchNearing(expiry));
                if (lowStock) parts.push(STOCK_ALERT_POPUP_COPY.skuBelow(lowStock));
                // eslint-disable-next-line no-alert
                window.alert(`${STOCK_ALERT_POPUP_COPY.prefix} ${parts.join(' • ')}. ${STOCK_ALERT_POPUP_COPY.checkExpiryInventory}`);
            } catch (e) {
                console.warn('Global alert check failed', e);
            }
        };

        void run(true);
        const id = window.setInterval(() => void run(false), POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [dispatch, enabled]);
}
