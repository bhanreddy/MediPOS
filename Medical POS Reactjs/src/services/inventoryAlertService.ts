import { db } from '../db/index';
import type { Product } from '../core/types';
import { AppSettingsService } from './appSettingsService';

const parseISODateLocal = (iso: string): Date => {
    const [y, m, d] = iso.split('-').map(n => Number(n));
    return new Date(y, (m || 1) - 1, d || 1);
};

const startOfTodayLocal = (): Date => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * Expiry + low-stock counts for global badges (aligned with Settings thresholds).
 */
export const InventoryAlertService = {
    async getCounts(): Promise<{ expiry: number; lowStock: number }> {
        const expiryDaysRaw = await AppSettingsService.getString('alert_expiry_days', '30');
        const expiryDays = Math.max(1, Math.min(365, Number(expiryDaysRaw) || 30));

        const [products, batches, inventory] = await Promise.all([
            db.products.toArray(),
            db.batches.toArray(),
            db.inventory.toArray(),
        ]);

        const productById = new Map<string, Product>();
        products.forEach(p => productById.set(p.id, p));

        const qtyByBatchId = new Map<string, number>();
        inventory.forEach(inv => {
            qtyByBatchId.set(inv.batch_id, (qtyByBatchId.get(inv.batch_id) ?? 0) + (inv.quantity ?? 0));
        });

        const today = startOfTodayLocal();
        const msPerDay = 24 * 60 * 60 * 1000;

        let expiry = 0;

        for (const b of batches) {
            const expiryDate = parseISODateLocal(b.expiry_date);
            const daysLeft = Math.floor((expiryDate.getTime() - today.getTime()) / msPerDay);
            if (daysLeft < 0 || daysLeft > expiryDays) continue;
            const q = qtyByBatchId.get(b.id) ?? 0;
            if (q <= 0) continue;
            expiry++;
        }

        const qtyByProduct = new Map<string, number>();
        for (const inv of inventory) {
            const batch = batches.find(bb => bb.id === inv.batch_id);
            if (!batch) continue;
            qtyByProduct.set(batch.product_id, (qtyByProduct.get(batch.product_id) ?? 0) + inv.quantity);
        }

        let lowStock = 0;
        for (const p of products) {
            if (!p.is_active) continue;
            const onHand = qtyByProduct.get(p.id) ?? 0;
            const threshold = Math.max(0, p.min_stock_alert ?? 0);
            if (threshold > 0 && onHand < threshold) {
                lowStock++;
            }
        }

        return { expiry, lowStock };
    },
};
