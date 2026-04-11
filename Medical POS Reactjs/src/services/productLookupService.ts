import { db } from '../db/index';
import type { Product, Batch } from '../core/types';

/** Billing / barcode / name search: stock snapshot aligned with sale allocation (FEFO, sellable batches). */
export interface SearchResult {
    product: Product;
    /** Quantity sellable under current expiry rules (matches allocateStock). */
    totalStock: number;
    batchCount: number;
    nearestExpiry: string | null;
    /** First FEFO batch that has qty > 0 (never an empty early-expiry batch). */
    bestBatchId: string | null;
}

export async function readAllowExpiredSale(): Promise<boolean> {
    try {
        const setting = await db.app_settings.where('key').equals('allow_expired_sale').first();
        return setting ? String(setting.value).toLowerCase() === 'true' : false;
    } catch {
        return false;
    }
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
    };
}

async function buildResultForProduct(product: Product): Promise<SearchResult | null> {
    const batches = await db.batches.where('product_id').equals(product.id).toArray();
    const inventory = await db.inventory
        .where('batch_id')
        .anyOf(batches.map(b => b.id))
        .toArray();

    const inventoryMap = new Map<string, number>();
    for (const inv of inventory) {
        inventoryMap.set(inv.batch_id, (inventoryMap.get(inv.batch_id) || 0) + inv.quantity);
    }

    const today = new Date().toISOString().split('T')[0];
    const allowExpired = await readAllowExpiredSale();
    return computeSearchResultForProduct(product, batches, inventoryMap, allowExpired, today);
}

/**
 * Resolve barcode / SKU from product.barcode or batch.barcode.
 */
export const ProductLookupService = {
    async findByBarcode(barcode: string): Promise<SearchResult | null> {
        const trimmed = barcode.trim();
        if (!trimmed) return null;

        const byProduct = await db.products.filter(p => p.is_active && p.barcode === trimmed).first();
        if (byProduct) {
            return buildResultForProduct(byProduct);
        }

        const byBatch = await db.batches.filter(b => b.barcode === trimmed).first();
        if (byBatch) {
            const product = await db.products.get(byBatch.product_id);
            if (!product?.is_active) return null;
            return buildResultForProduct(product);
        }

        return null;
    },
};
