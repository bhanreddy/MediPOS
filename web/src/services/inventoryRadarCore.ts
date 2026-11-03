import api from '../lib/api';
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

export type InventoryViewMode = 'active' | 'disposed';

export interface DisposedBatchItem {
    id: string;
    name: string;
    batch: string;
    expiry: string;
    disposedAt: string;
    disposedBy: string;
    reason: string;
}

/** Dispose allowed when expired or batch is in critical attention state. */
export function canDisposeBatch(item: RadarItem, todayStr = new Date().toISOString().split('T')[0]): boolean {
    return item.expiry < todayStr || item.status === 'CRITICAL';
}

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

/** The same calendar window the inventory screen uses to mark low stock and expiry. */
export async function attentionWindow(): Promise<{ today: string; warning: string }> {
    const expiryDaysRaw = await AppSettingsService.getString(
        'alert_expiry_days',
        String(RADAR_CONFIG.expiryWarningDays),
    );
    const expiryWarningDays = Math.max(
        1,
        Math.min(365, Number(expiryDaysRaw) || RADAR_CONFIG.expiryWarningDays),
    );
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + expiryWarningDays);
    return {
        today: today.toISOString().split('T')[0],
        warning: warningDate.toISOString().split('T')[0],
    };
}

/**
 * Single pass: Stock Radar rows + summary stats (Inventory page cards).
 * Expiry "warning" window uses Settings `alert_expiry_days` (same as Alerts drawer / Settings).
 * Fetches all medicines with their nested batches from the backend API.
 */
export async function buildRadarItemsWithStats(): Promise<{
    items: RadarItem[];
    stats: InventoryRadarStats;
}> {
    const { today: todayStr, warning: warningStr } = await attentionWindow();

    // Fetch all medicines with nested medicine_batches from backend
    const res = await api.get('/inventory/medicines');
    const medicines: any[] = res.data?.data || res.data || [];

    const radarItems: RadarItem[] = [];
    let totalAssets = 0;
    let criticalCount = 0;
    let nearExpiryCount = 0;
    let valuation = 0;

    for (const med of medicines) {
        if (med.is_active === 0 || med.is_active === false) continue;

        const batches: any[] = med.medicine_batches || [];
        const minAlert = Math.max(1, med.low_stock_threshold ?? med.min_stock_alert ?? 10);
        const criticalQtyThreshold = Math.max(1, Math.floor(minAlert * 0.5));

        for (const batch of batches) {
            if (batch.is_disposed === true || batch.is_disposed === 1) continue;

            const qty = Number(batch.quantity_remaining ?? 0);
            if (qty <= 0) continue;

            const batchExpiry = String(batch.expiry_date || '').slice(0, 10);
            const purchaseRate = Number(batch.purchase_price ?? batch.purchase_rate ?? 0);

            let status: RadarItem['status'] = 'NORMAL';
            let priority = 0;

            if (batchExpiry < todayStr) {
                status = 'CRITICAL';
                priority = 1500;
                criticalCount++;
            } else if (qty <= criticalQtyThreshold) {
                status = 'CRITICAL';
                priority = 100;
                criticalCount++;
            } else if (qty < minAlert) {
                status = 'LOW_STOCK';
                priority = 80;
            } else if (batchExpiry <= warningStr) {
                status = 'LOW_STOCK';
                priority = 50;
                nearExpiryCount++;
            } else {
                status = 'NORMAL';
                priority = 0;
            }

            totalAssets += qty;
            valuation += qty * purchaseRate;

            radarItems.push({
                id: batch._local_id || batch.id,
                productId: med._local_id || med.id,
                name: med.name,
                batch: batch.batch_number || '',
                expiry: batchExpiry,
                qty,
                status,
                priority,
            });
        }
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

export async function buildDisposedBatchItems(): Promise<DisposedBatchItem[]> {
    const res = await api.get('/inventory/batches/disposed');
    const rows: any[] = res.data?.data || res.data || [];

    return rows.map((row) => ({
        id: row._local_id || row.id,
        name: row.medicine_name || '—',
        batch: row.batch_number || '—',
        expiry: String(row.expiry_date || '—').slice(0, 10),
        disposedAt: row.disposed_at ? String(row.disposed_at).slice(0, 10) : '—',
        disposedBy: row.disposed_by_label || '—',
        reason: row.disposal_reason || '—',
    }));
}

