import { useState, useCallback } from 'react';
import { db } from '../db/index';
import { v4 as uuidv4 } from 'uuid';
import type { Product, Purchase } from '../core/types';

export interface PurchaseItemDraft {
    id: string; // Temp ID for draft manipulation
    product: Product;
    batchNumber: string;
    expiryDate: string; // YYYY-MM-DD
    quantity: number;
    costPrice: number;
    mrp: number;
    total: number;
}

export const usePurchaseFlow = () => {
    const [vendorId, setVendorId] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [inwardDate, setInwardDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<PurchaseItemDraft[]>([]);

    const [isCommitting, setIsCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDraft, setIsDraft] = useState(true);

    const addItem = useCallback((item: Omit<PurchaseItemDraft, 'id' | 'total'>) => {
        const newItem: PurchaseItemDraft = {
            ...item,
            id: uuidv4(),
            total: item.quantity * item.costPrice
        };
        setItems(prev => [...prev, newItem]);
    }, []);

    const removeItem = useCallback((id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    }, []);

    const resetDraft = useCallback(() => {
        setVendorId('');
        setInvoiceNumber('');
        setInwardDate(new Date().toISOString().split('T')[0]);
        setItems([]);
        setIsDraft(true);
        setError(null);
    }, []);

    const commitToLedger = async () => {
        if (!vendorId) {
            setError("Vendor is required.");
            return;
        }
        if (!invoiceNumber) {
            setError("Invoice Number is required.");
            return;
        }
        if (items.length === 0) {
            setError("No items to commit.");
            return;
        }

        setIsCommitting(true);
        setError(null);

        try {
            await db.transaction('rw', [db.purchases, db.batches, db.inventory, db.audit_logs], async () => {
                const now = new Date().toISOString();

                // 1. Create Purchase Record
                const purchaseId = uuidv4();
                const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

                const newPurchase: Purchase = {
                    id: purchaseId,
                    supplier_id: vendorId,
                    invoice_number: invoiceNumber,
                    invoice_date: inwardDate,
                    received_date: now,
                    total_amount: totalAmount,
                    tax_amount: 0, // Simplified for now
                    status: 'COMPLETED',
                    created_at: now,
                    updated_at: now,
                    last_modified: Date.now()
                };

                await db.purchases.add(newPurchase);

                // 2. Process Items
                for (const item of items) {
                    // Check for existing batch (Product + BatchNo + Expiry)
                    // Note: Ideally strict on BatchNo, but Expiry creates unique variance? 
                    // Let's assume unique batch_number per product is enough, but same batch no with different expiry is strictly different batch?
                    // "Duplicate batch+product+expiry allowed ONLY if intended (increment stock)"

                    let batchId = '';
                    const existingBatch = await db.batches
                        .where('[product_id+batch_number]')
                        .equals([item.product.id, item.batchNumber])
                        .first();

                    if (existingBatch) {
                        // Safety: Check expiry match? 
                        if (existingBatch.expiry_date !== item.expiryDate) {
                            // Same batch number, different expiry? Usually error or new sub-batch.
                            // For safety, let's treat as ERROR for now or create NEW batch with suffix?
                            // "Mistakes here break the entire system." -> Treat as ERROR to force operator check.
                            throw new Error(`Batch ${item.batchNumber} exists with different expiry (${existingBatch.expiry_date}). Mode mismatch.`);
                        }
                        batchId = existingBatch.id;
                    } else {
                        // Create New Batch
                        batchId = uuidv4();
                        await db.batches.add({
                            id: batchId,
                            product_id: item.product.id,
                            purchase_id: purchaseId,
                            batch_number: item.batchNumber,
                            expiry_date: item.expiryDate,
                            mrp: item.mrp,
                            purchase_rate: item.costPrice,
                            sales_rate: item.mrp, // Default sales rate to MRP
                            created_at: now,
                            updated_at: now,
                            last_modified: Date.now()
                        });
                    }

                    // 3. Update Inventory
                    // Check if inventory exists for this batch
                    const inventoryItem = await db.inventory.where({ batch_id: batchId }).first();

                    if (inventoryItem) {
                        await db.inventory.update(inventoryItem.id, {
                            quantity: inventoryItem.quantity + item.quantity,
                            updated_at: now,
                            last_modified: Date.now()
                        });
                    } else {
                        await db.inventory.add({
                            id: uuidv4(),
                            batch_id: batchId,
                            quantity: item.quantity,
                            location: 'DEFAULT', // Can be enhanced later
                            created_at: now,
                            updated_at: now,
                            last_modified: Date.now()
                        });
                    }
                }

                // 4. Audit Log (Simplified)
                await db.audit_logs.add({
                    id: uuidv4(),
                    table_name: 'purchases',
                    record_id: purchaseId,
                    action: 'CREATE',
                    user_id: 'SYSTEM', // TODO: Get actual user
                    created_at: now,
                    updated_at: now,
                    last_modified: Date.now()
                });
            });

            setIsDraft(false);
            // Optionally auto-reset or let user see "Finalized" state?
            // "Return to clean state" -> Logic says let UI handle the "Success" banner then reset.

        } catch (err: any) {
            console.error("Commit failed", err);
            setError(err.message || "Transaction Failed");
        } finally {
            setIsCommitting(false);
        }
    };

    return {
        vendorId, setVendorId,
        invoiceNumber, setInvoiceNumber,
        inwardDate, setInwardDate,
        items,
        addItem, removeItem,
        commitToLedger,
        isCommitting,
        error,
        isDraft,
        resetDraft
    };
};
