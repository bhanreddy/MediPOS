import api from '../lib/api';
import type { Product, Batch } from '../core/types';

/** Billing / barcode / name search: stock snapshot aligned with sale allocation (FEFO, sellable batches). */
export interface SearchResult {
    product: Product & {
        brand_name?: string;
        prescription_required?: boolean;
        schedule_classification?: string;
        cold_chain_required?: boolean;
    };
    /** Quantity sellable under current expiry rules (matches allocateStock). */
    totalStock: number;
    batchCount: number;
    nearestExpiry: string | null;
    /** First FEFO batch that has qty > 0 (never an empty early-expiry batch). */
    bestBatchId: string | null;
    /** Stock and price already returned by search; checkout revalidates stock. */
    bestBatch?: MedicineBatchRow;
}

/** Keep only matching suggestions while the next network search is in flight. */
export function filterSearchResults(results: SearchResult[], query: string): SearchResult[] {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    if (/^\d{3,}$/.test(term)) return results.filter(result => result.product.barcode === term);
    return results.filter(({ product }) =>
        [product.name, product.composition].some(value => value?.toLowerCase().includes(term)),
    );
}

export async function readAllowExpiredSale(): Promise<boolean> {
    return false; // Default safe for online-first
}

export function matchesEntityId(
    entity: { id?: string; _local_id?: string },
    targetId: string | null | undefined,
): boolean {
    if (!targetId) return false;
    return entity.id === targetId || entity._local_id === targetId;
}

export type MedicineBatchRow = {
    id?: string;
    _local_id?: string;
    quantity_remaining?: number;
    expiry_date?: string;
    batch_number?: string;
    mrp?: number;
    sales_rate?: number;
    purchase_price?: number;
    purchase_rate?: number;
    is_disposed?: boolean | number;
};

/** Pick the FEFO sellable batch from a medicine detail response. */
export function resolveBatchFromMedicineDetail(
    batches: MedicineBatchRow[],
    bestBatchId: string | null,
    allowExpired = false,
): MedicineBatchRow | null {
    const today = new Date().toISOString().split('T')[0];
    const sellable = batches
        .filter(batch => {
            if (batch.is_disposed === true || batch.is_disposed === 1) return false;
            const qty = Number(batch.quantity_remaining ?? 0);
            if (qty <= 0) return false;
            if (!allowExpired && batch.expiry_date && batch.expiry_date < today) return false;
            return true;
        })
        .sort((a, b) => String(a.expiry_date ?? '').localeCompare(String(b.expiry_date ?? '')));

    if (bestBatchId) {
        const preferred = sellable.find(batch => matchesEntityId(batch, bestBatchId));
        if (preferred) return preferred;
    }

    return sellable[0] ?? null;
}

/**
 * Pick default batch and totals for POS: FEFO among batches that actually have stock.
 * Aligns with InventoryService.allocateStock (expiry + allow_expired_sale).
 */
export function computeSearchResultForProduct(
    product: Product,
    productBatches: Batch[],
    inventoryMap: Map<string, number>,
    allowExpired: boolean,
    today: string
): SearchResult {
    const stockedSellable: (Batch & { qty: number })[] = [];
    let sellableTotal = 0;

    for (const batch of productBatches) {
        if ((batch as Batch & { is_disposed?: boolean }).is_disposed) continue;
        const qty = inventoryMap.get(batch.id) || 0;
        const expired = batch.expiry_date < today;
        if (expired && !allowExpired) continue;

        sellableTotal += qty;
        if (qty > 0) {
            stockedSellable.push({ ...batch, qty });
        }
    }

    stockedSellable.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));

    return {
        product,
        totalStock: sellableTotal,
        batchCount: stockedSellable.length,
        nearestExpiry: stockedSellable[0]?.expiry_date ?? null,
        bestBatchId: stockedSellable[0]?.id ?? null,
        bestBatch: stockedSellable[0] ? {
            ...stockedSellable[0],
            quantity_remaining: stockedSellable[0].qty,
        } : undefined,
    };
}

/** Map each medicine and its batches together, avoiding repeated full-array scans. */
export function mapMedicineSearchResult(m: any, allowExpired: boolean, today: string): SearchResult {
    const product: SearchResult['product'] = {
        id: m.id || m._local_id,
        _local_id: m._local_id || m.id,
        name: m.name,
        composition: m.generic_name || m.composition || '',
        manufacturer: m.manufacturer || '',
        type: m.type || 'TABLET',
        hsn_code: m.hsn_code || '',
        gst_rate: Number(m.gst_rate || 0),
        min_stock_alert: Number(m.low_stock_threshold ?? m.min_stock_alert ?? 5),
        is_active: m.is_active === 1 || m.is_active === true,
        brand_name: m.brand_name,
        prescription_required: Boolean(m.prescription_required || m.is_schedule_h1),
        schedule_classification: m.schedule_classification || (m.is_schedule_h1 ? 'SCHEDULE_H1' : 'NONE'),
        cold_chain_required: Boolean(m.cold_chain_required),
        created_at: m.created_at,
        updated_at: m.updated_at,
        last_modified: Date.now(),
    };
    const inventory = new Map<string, number>();
    const batches: Batch[] = [];
    for (const batch of m.medicine_batches || []) {
        if (batch.is_disposed === true || batch.is_disposed === 1) continue;
        const id = batch._local_id || batch.id;
        batches.push({
            id, _local_id: id, product_id: product.id,
            purchase_id: batch.purchase_id || '',
            batch_number: batch.batch_number,
            mrp: Number(batch.mrp || 0),
            purchase_rate: Number(batch.purchase_price ?? batch.purchase_rate ?? 0),
            sales_rate: Number(batch.sales_rate ?? batch.mrp ?? 0),
            expiry_date: batch.expiry_date || today,
            created_at: batch.created_at,
            updated_at: batch.updated_at,
            last_modified: Date.now(),
        });
        inventory.set(id, Number(batch.quantity_remaining || 0));
    }
    const result = computeSearchResultForProduct(product, batches, inventory, allowExpired, today);
    return { ...result, product };
}

/** Resolve barcode / SKU using the same stock mapping as name search. */
export const ProductLookupService = {
    async findByBarcode(barcode: string): Promise<SearchResult | null> {
        const trimmed = barcode.trim();
        if (!trimmed) return null;
        try {
            const res = await api.get('/inventory/medicines/search', {
                params: { barcode: trimmed, limit: 1, include_substitutes: false },
            });
            const medicine = res.data?.results?.[0];
            if (!medicine) return null;
            return mapMedicineSearchResult(medicine, await readAllowExpiredSale(), new Date().toISOString().split('T')[0]);
        } catch (error) {
            console.error('Barcode lookup failed', error);
            return null;
        }
    },
};
