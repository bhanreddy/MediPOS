import api from '../lib/api';
import { loadInventoryCatalogue } from './inventoryCatalogue';
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
    lowStock: boolean;
    expiring: boolean;
    expired: boolean;
    hasBatch: boolean;
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

/** Medicines without a batch cannot be disposed. */
export function canDisposeBatch(item: RadarItem): boolean {
    return item.hasBatch && (item.expired || item.status === 'CRITICAL');
}

/** Attention flags are independent: low stock can also be nearing expiry. */
export function matchesAttentionFilter(
    item: RadarItem,
    filter: InventoryAttentionFilter | null | undefined,
): boolean {
    if (filter === 'low_stock') return item.lowStock;
    if (filter === 'expiring') return item.expiring;
    return true;
}

/** Calendar dates in the shop's browser timezone, including around midnight. */
export function inventoryDay(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
        today: inventoryDay(today),
        warning: inventoryDay(warningDate),
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

    const medicines = await loadInventoryCatalogue();

    return classifyInventory(medicines, todayStr, warningStr);
}

/** Low stock is based on total unexpired stock per medicine, including stockouts. */
export function classifyInventory(medicines: any[], today: string, warning: string): {
    items: RadarItem[];
    stats: InventoryRadarStats;
} {
    const items: RadarItem[] = [];
    const stats: InventoryRadarStats = { totalAssets: 0, criticalStock: 0, nearExpiry: 0, netValuation: 0 };
    for (const med of medicines) {
        if (med.is_active === 0 || med.is_active === false || med.deleted_at) continue;
        const batches = (med.medicine_batches || []).filter((batch: any) =>
            !batch.deleted_at && batch.is_disposed !== true && batch.is_disposed !== 1 && Number(batch.quantity_remaining) > 0,
        );
        const threshold = Math.max(0, Number(med.low_stock_threshold ?? med.min_stock_alert ?? 10));
        const available = batches.reduce((sum: number, batch: any) => {
            const expiry = String(batch.expiry_date || '').slice(0, 10);
            return sum + (expiry >= today ? Number(batch.quantity_remaining) : 0);
        }, 0);
        const lowStock = available <= threshold;
        const critical = available <= Math.max(1, Math.floor(threshold * 0.5));
        if (lowStock) stats.criticalStock++;

        // Keep stockouts actionable even when no batch has remaining stock.
        const rows = batches.length ? batches : [null];
        for (const batch of rows) {
            const expiry = batch ? String(batch.expiry_date || '').slice(0, 10) : '';
            const expired = !!expiry && expiry < today;
            const expiring = !!expiry && expiry <= warning;
            const qty = Number(batch?.quantity_remaining ?? 0);
            const status = expired || (lowStock && critical) ? 'CRITICAL' : lowStock || expiring ? 'LOW_STOCK' : 'NORMAL';
            const priority = expired ? 1500 : lowStock ? (critical ? 100 : 80) : expiring ? 50 : 0;
            if (batch) {
                stats.totalAssets++;
                stats.netValuation += qty * Number(batch.purchase_price ?? batch.purchase_rate ?? 0);
            }
            if (expiring) stats.nearExpiry++;
            items.push({
                id: batch ? batch._local_id || batch.id : `stockout:${med._local_id || med.id}`,
                productId: med._local_id || med.id,
                name: med.name,
                batch: batch?.batch_number || '—',
                expiry: expiry || '—',
                qty, status, priority, lowStock, expiring, expired, hasBatch: !!batch,
            });
        }
    }
    return { items, stats };
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

