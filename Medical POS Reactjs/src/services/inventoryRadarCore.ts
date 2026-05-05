import { db } from '../db/index';
import type { Product, Batch } from '../core/types';
import { RADAR_CONFIG } from '../config/appContent';
import { AppSettingsService } from './appSettingsService';

/** One inventory row (SKU × location) after radar classification — must stay in sync with Inventory screen filters. */
export interface RadarItem {
    id: string;
    productId: string;
    name: string;
    batch: string;
    expiry: string;
    qty: number;
    status: 'CRITICAL' | 'LOW_STOCK' | 'NORMAL';
    priority: number;
}

export interface InventoryRadarStats {
    totalAssets: number;
    criticalStock: number;
    nearExpiry: number;
    netValuation: number;
}

export type InventoryAttentionFilter = 'all' | 'low_stock' | 'expiring';

/** Same semantics as `/inventory?focus=` navigation from ClinicLayout. */
export function matchesAttentionFilter(
    item: RadarItem,
    filter: InventoryAttentionFilter | null | undefined,
): boolean {
    if (!filter || filter === 'all') return true;
    if (filter === 'low_stock') {
        return (
            (item.status === 'CRITICAL' && item.priority === 100) ||
            (item.status === 'LOW_STOCK' && item.priority === 80)
        );
    }
    if (filter === 'expiring') {
        return (
            (item.status === 'LOW_STOCK' && item.priority === 50) ||
            (item.status === 'CRITICAL' && item.priority === 1500)
        );
    }
    return true;
}

/**
 * Single pass: Stock Radar rows + summary stats (Inventory page cards).
 * Expiry “warning” window uses Settings `alert_expiry_days` (same as Alerts drawer / Settings).
 */
export async function buildRadarItemsWithStats(): Promise<{
    items: RadarItem[];
    stats: InventoryRadarStats;
}> {
    const expiryDaysRaw = await AppSettingsService.getString(
        'alert_expiry_days',
        String(RADAR_CONFIG.expiryWarningDays),
    );
    const expiryWarningDays = Math.max(
        1,
        Math.min(365, Number(expiryDaysRaw) || RADAR_CONFIG.expiryWarningDays),
    );

    const inventory = await db.inventory.toArray();
    const batchIds = inventory.map(i => i.batch_id);
    const batches = await db.batches.bulkGet(batchIds);
    const batchMap = new Map<string, Batch>();
    batches.forEach(b => {
        if (b) batchMap.set(b.id, b);
    });

    const productIds = Array.from(new Set(batches.map(b => b?.product_id).filter(Boolean))) as string[];
    const products = await db.products.bulkGet(productIds);
    const productMap = new Map<string, Product>();
    products.forEach(p => {
        if (p) productMap.set(p.id, p);
    });

    const radarItems: RadarItem[] = [];
    let totalAssets = 0;
    let criticalCount = 0;
    let nearExpiryCount = 0;
    let valuation = 0;

    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + expiryWarningDays);
    const warningStr = warningDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    for (const inv of inventory) {
        const batch = batchMap.get(inv.batch_id);
        const product = productMap.get(batch?.product_id || '');

        if (!batch || !product) continue;
        if (!product.is_active) continue;
        if (inv.quantity <= 0) continue;

        const minAlert = Math.max(1, product.min_stock_alert ?? 10);
        const criticalQtyThreshold = Math.max(1, Math.floor(minAlert * 0.5));

        let status: RadarItem['status'] = 'NORMAL';
        let priority = 0;

        if (batch.expiry_date < todayStr) {
            status = 'CRITICAL';
            priority = 1500;
            criticalCount++;
        } else if (inv.quantity <= criticalQtyThreshold) {
            status = 'CRITICAL';
            priority = 100;
            criticalCount++;
        } else if (inv.quantity < minAlert) {
            status = 'LOW_STOCK';
            priority = 80;
        } else if (batch.expiry_date <= warningStr) {
            status = 'LOW_STOCK';
            priority = 50;
            nearExpiryCount++;
        } else {
            status = 'NORMAL';
            priority = 0;
        }

        totalAssets += inv.quantity;
        valuation += inv.quantity * batch.purchase_rate;

        radarItems.push({
            id: inv.id,
            productId: product.id,
            name: product.name,
            batch: batch.batch_number,
            expiry: batch.expiry_date,
            qty: inv.quantity,
            status,
            priority,
        });
    }

    return {
        items: radarItems,
        stats: {
            totalAssets,
            criticalStock: criticalCount,
            nearExpiry: nearExpiryCount,
            netValuation: valuation,
        },
    };
}

export async function buildRadarItems(): Promise<RadarItem[]> {
    const { items } = await buildRadarItemsWithStats();
    return items;
}
