import { buildRadarItems, matchesAttentionFilter } from './inventoryRadarCore';

/**
 * Header alerts & badges — counts match Inventory `/inventory?focus=` filters exactly.
 */
export const InventoryAlertService = {
    async getCounts(): Promise<{ expiry: number; lowStock: number }> {
        const items = await buildRadarItems();
        let lowStock = 0;
        let expiry = 0;
        for (const item of items) {
            if (matchesAttentionFilter(item, 'low_stock')) lowStock++;
            if (matchesAttentionFilter(item, 'expiring')) expiry++;
        }
        return { expiry, lowStock };
    },
};
