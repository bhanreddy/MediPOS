import { db } from '../db/index';
import type { Inventory, Batch } from '../core/types';
import { AuditService } from './auditService';
import { store } from '../state/store';
import { inventorySlice } from '../state/slices';
import { v4 as uuidv4 } from 'uuid';

export class InsufficientStockError extends Error {
    productId: string;
    missing: number;
    available: number;
    requested: number;
    productName?: string;

    constructor(productId: string, missing: number, available: number, requested: number) {
        super(`Insufficient stock for Product ${productId}. Missing ${missing}`);
        this.name = 'InsufficientStockError';
        this.productId = productId;
        this.missing = missing;
        this.available = available;
        this.requested = requested;
    }
}

/**
 * PHASE 5: INVENTORY ENGINE
 * Handles Batch Management, FEFO Logic, and Stock Mutations.
 */

export const InventoryService = {

    // --- READS ---

    /**
     * Get all active batches for a product, sorted by FEFO (Expiry Date).
     */
    async getBatchesForProduct(productId: string): Promise<Batch[]> {
        return await db.batches
            .where('product_id')
            .equals(productId)
            .sortBy('expiry_date');
    },

    /**
     * Get total available stock quantity for a product across all locations.
     */
    async getAvailableStock(productId: string): Promise<number> {
        const batches = await this.getBatchesForProduct(productId);
        let total = 0;

        // Check Config for aggregation too? 
        // Usually "Available Stock" includes expired ones but displays them as unsellable.
        // However, for "Sellable Stock", we should filter.
        // For now, we return Total Physical Stock.

        for (const batch of batches) {
            const inventoryItems = await db.inventory
                .where('batch_id')
                .equals(batch.id)
                .toArray();

            total += inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
        }

        return total;
    },

    isBatchExpired(batch: Batch): boolean {
        const today = new Date().toISOString().split('T')[0];
        return batch.expiry_date < today;
    },

    // --- WRITES (PURCHASE / INWARD) ---

    /**
     * Create a new Batch from a Purchase.
     * Also initializes Inventory record for 'Default' location.
     */
    async addBatch(
        productId: string,
        batchNumber: string,
        expiryDate: string,
        mrp: number,
        purchaseRate: number,
        quantity: number,
        purchaseId: string
    ): Promise<Batch> {

        const now = new Date().toISOString();

        // 1. Create Batch Metadata
        const newBatch: Batch = {
            id: uuidv4(),
            product_id: productId,
            purchase_id: purchaseId,
            batch_number: batchNumber,
            expiry_date: expiryDate,
            mrp,
            purchase_rate: purchaseRate,
            sales_rate: mrp, // Defaulting to MRP, can be overridden
            created_at: now,
            updated_at: now,
            last_modified: Date.now()
        };

        // 2. Create Inventory Record
        const newInventory: Inventory = {
            id: uuidv4(),
            batch_id: newBatch.id,
            quantity,
            location: 'Store-Front', // Default location
            created_at: now,
            updated_at: now,
            last_modified: Date.now()
        };

        // 3. Atomic Write
        await db.transaction('rw', db.batches, db.inventory, db.audit_logs, async () => {
            await db.batches.add(newBatch);
            await db.inventory.add(newInventory);

            await AuditService.log('batches', newBatch.id, 'CREATE', null, newBatch);
            await AuditService.log('inventory', newInventory.id, 'CREATE', null, newInventory);
        });

        // 4. Hydrate Redux (fire and forget)
        this.triggerHydration();

        return newBatch;
    },

    // --- FEFO ENGINE (CRITICAL) ---

    /**
     * Allocation Logic:
     * Finds the best batches to fulfill the requested quantity using FEFO.
     * Throws error if insufficient stock.
     */
    async allocateStock(productId: string, requestedQty: number): Promise<{ batchId: string, qty: number }[]> {
        const batches = await this.getBatchesForProduct(productId);
        const allocation: { batchId: string, qty: number }[] = [];
        let remaining = requestedQty;

        // Check Config
        let allowExpired = false;
        try {
            const setting = await db.app_settings.where('key').equals('allow_expired_sale').first();
            // Safe boolean parsing
            allowExpired = setting ? String(setting.value).toLowerCase() === 'true' : false;
        } catch (e) {
            console.warn('Failed to read app_settings', e);
        }

        for (const batch of batches) {
            if (remaining <= 0) break;

            const isExpired = this.isBatchExpired(batch);
            // STRICT RULE: Skip expired batches unless explicitly allowed via Config
            if (isExpired && !allowExpired) continue;

            // Get current qty for this batch
            const inventoryItems = await db.inventory.where('batch_id').equals(batch.id).toArray();
            const batchTotal = inventoryItems.reduce((sum, item) => sum + item.quantity, 0);

            if (batchTotal <= 0) continue;

            const take = Math.min(remaining, batchTotal);
            allocation.push({ batchId: batch.id, qty: take });
            remaining -= take;
        }

        if (remaining > 0) {
            throw new InsufficientStockError(productId, remaining, requestedQty - remaining, requestedQty);
        }

        return allocation;
    },

    // --- MUTATIONS (INTERNAL) ---

    /**
     * Internal Atomic Stock Adjustment.
     * Used by BillingService (Decrease) or Returns (Increase).
     */
    async adjustStock(batchId: string, delta: number, reason: string) {
        await db.transaction('rw', db.inventory, db.audit_logs, async () => {
            // Simplification: We assume single inventory record per batch for Phase 5.
            // Real WMS would handle multi-location.
            const invItems = await db.inventory.where('batch_id').equals(batchId).toArray();
            if (invItems.length === 0) throw new Error('Inventory record not found for batch');

            const targetInv = invItems[0]; // Take first location for now
            const newQty = targetInv.quantity + delta;

            if (newQty < 0) throw new Error(`Negative stock prevented for Batch ${batchId}`);

            const oldRecord = { ...targetInv };
            await db.inventory.update(targetInv.id, {
                quantity: newQty,
                updated_at: new Date().toISOString(),
                last_modified: Date.now()
            });

            await AuditService.log('inventory', targetInv.id, 'UPDATE', oldRecord, { ...targetInv, quantity: newQty, reason });
        });

        this.triggerHydration();
    },

    async triggerHydration() {
        // Redux Mirror Update
        const allInventory = await db.inventory.toArray();
        store.dispatch(inventorySlice.actions.hydrateInventory(allInventory));
    }
};
