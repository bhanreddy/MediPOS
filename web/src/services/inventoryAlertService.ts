import api from '../lib/api';
import { attentionWindow, buildRadarItems, matchesAttentionFilter } from './inventoryRadarCore';

/**
 * Header alerts & badges — counts match Inventory `/inventory?focus=` filters exactly.
 * One counted query; the full catalog download remains for servers that do not have it yet.
 */
export const InventoryAlertService = {
    async getCounts(): Promise<{ expiry: number; lowStock: number; shortbook: number }> {
        const window = await attentionWindow();
        try {
            const { data } = await api.get('/inventory/attention-counts', { params: window });
            const body = data?.data ?? data ?? {};
            return {
                lowStock: Number(body.low_stock) || 0,
                expiry: Number(body.expiring) || 0,
                shortbook: Number(body.shortbook) || 0,
            };
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status !== 404) throw err;
        }
        const items = await buildRadarItems();
        let lowStock = 0;
        let expiry = 0;
        for (const item of items) {
            if (matchesAttentionFilter(item, 'low_stock')) lowStock++;
            if (matchesAttentionFilter(item, 'expiring')) expiry++;
        }
        let shortbook = 0;
        try {
            const { data } = await api.get<{ data?: unknown[] }>('/shortbook');
            if (Array.isArray(data?.data)) shortbook = data.data.length;
        } catch {
            /* API offline or route unavailable */
        }
        return { expiry, lowStock, shortbook };
    },
};
