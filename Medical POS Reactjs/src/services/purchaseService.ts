import { db } from '../db/index';
import type { Purchase, Batch, Inventory } from '../core/types';
import { AuditService } from './auditService';
import { v4 as uuidv4 } from 'uuid';
import { HydrationService } from '../state/hydration';
import { SupplierLedgerService } from './supplierLedgerService';

/**
 * PHASE 7: PURCHASE SERVICE
 * Handles Inbound Stock (Purchases) and Batch Creation.
 */

export interface PurchaseItemInput {
    productId: string;
    batchNumber: string;
    expiryDate: string; // YYYY-MM-DD
    mrp: number;
    purchaseRate: number;
    quantity: number;
}

export const PurchaseService = {

    /**
     * ATOMIC PURCHASE COMMIT
     * 1. Create Purchase Record
     * 2. Create Batches (One per item)
     * 3. Create Inventory (One per batch)
     * 4. Audit Log
     */
    async finalizePurchase(
        supplierId: string,
        invoiceNumber: string,
        invoiceDate: string,
        receivedDate: string,
        items: PurchaseItemInput[],
        totalAmount: number,
        taxAmount: number
    ): Promise<Purchase> {

        if (items.length === 0) throw new Error('Purchase must have at least one item');

        // Use Array format for tables to avoid argument limit issues
        const tables = [db.purchases, db.batches, db.inventory, db.audit_logs, db.suppliers];

        const commitedPurchase = await db.transaction('rw', tables, async () => {

            const now = new Date().toISOString();
            const purchaseId = uuidv4();

            // 1. Prepare Purchase Record
            const newPurchase: Purchase = {
                id: purchaseId,
                supplier_id: supplierId,
                invoice_number: invoiceNumber,
                invoice_date: invoiceDate,
                received_date: receivedDate,
                total_amount: totalAmount,
                tax_amount: taxAmount,
                status: 'COMPLETED', // Atomic commit implies completion
                created_at: now,
                updated_at: now,
                last_modified: Date.now()
            };

            await db.purchases.add(newPurchase);
            await AuditService.log('purchases', purchaseId, 'CREATE', null, newPurchase);

            // 2. Process Items (Create Batch + Inventory)
            for (const item of items) {

                // Validation: Unique Batch?
                // In theory, same batch number can exist for different products.
                // But for SAME product, batch number should be unique? 
                // Or if we buy MORE of the same batch, do we merge?
                // Phase 7 Rule: "Batch ID immutable". "Duplicate batch creation on retry".
                // If we receive the SAME batch number again, usually we extend the existing batch or reject?
                // For strict traceability, a new Purchase usually implies a new "Lot". 
                // If the physical batch no is identical, we *could* merge, but Expiry/MRP might differ? (Rare).
                // Safest approach: Check if Batch exists. If so, update Inventory? 
                // Or create "Batch-Entry" logic?
                // Given Phase 5 "Inventory is Batch Based" and "Batch ID immutable", 
                // let's assume if (Product + BatchNo) exists, we verify Expiry/Rates match.
                // If they match, we add to Inventory. If not, Error?
                // SIMPLIFICATION FOR PHASE 7: 
                // We will assume unique batches or enable duplicate check.
                // Actually, let's treat every Purchase Line as a NEW Batch Entry logically, 
                // but if the unique key (product_id + batch_number) collides, we handle it.
                // Dexie schema `batches: '[product_id+expiry_date]'` ?? No, that was Phase 2.
                // Let's look at `db.ts` schema for batches.
                // `batches: 'id, product_id, purchase_id, batch_number, expiry_date, last_modified'`
                // Use `id` (UUID) as PK. So we CAN have multiple batches with same string `batch_number`.
                // This is safe. The UI might show them aggregated, but DB keeps them distinct by Purchase ID.
                // Correct Phase 7 impl: Create NEW Batch record linked to THIS Purchase.

                const batchId = uuidv4();

                const newBatch: Batch = {
                    id: batchId,
                    product_id: item.productId,
                    purchase_id: purchaseId,
                    batch_number: item.batchNumber,
                    expiry_date: item.expiryDate,
                    mrp: item.mrp,
                    purchase_rate: item.purchaseRate,
                    sales_rate: item.mrp,
                    created_at: now,
                    updated_at: now,
                    last_modified: Date.now()
                };

                const newInventory: Inventory = {
                    id: uuidv4(),
                    batch_id: batchId,
                    quantity: item.quantity,
                    location: 'Store-Front',
                    created_at: now,
                    updated_at: now,
                    last_modified: Date.now()
                };

                await db.batches.add(newBatch);
                await db.inventory.add(newInventory);

                await AuditService.log('batches', batchId, 'CREATE', null, newBatch);
                await AuditService.log('inventory', newInventory.id, 'CREATE', null, newInventory);
            }

            return newPurchase;
        });

        await SupplierLedgerService.recordPurchase(
            supplierId,
            commitedPurchase.id,
            commitedPurchase.total_amount,
            `Purchase ${commitedPurchase.invoice_number}`
        );

        // 3. Hydrate Redux
        await HydrationService.hydrateInventory();

        return commitedPurchase;
    }
};
