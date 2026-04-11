import { db } from '../db/index';
import type { PurchaseReturn, PurchaseReturnLine } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './auditService';
import { SupplierLedgerService } from './supplierLedgerService';
import { HydrationService } from '../state/hydration';

export interface PurchaseReturnLineInput {
    batchId: string;
    quantity: number;
}

export const PurchaseReturnService = {
    async postReturn(supplierId: string, lines: PurchaseReturnLineInput[], referenceNote: string): Promise<PurchaseReturn> {
        if (!lines.length) throw new Error('Return needs at least one line');

        const tables = [db.purchase_returns, db.purchase_return_lines, db.inventory, db.batches, db.audit_logs];

        const header = await db.transaction('rw', tables, async () => {
            const now = new Date().toISOString();
            const returnId = uuidv4();
            let totalValue = 0;
            const lineRows: PurchaseReturnLine[] = [];

            for (const ln of lines) {
                const batch = await db.batches.get(ln.batchId);
                if (!batch) throw new Error(`Batch ${ln.batchId} not found`);
                const purchase = await db.purchases.get(batch.purchase_id);
                if (!purchase || purchase.supplier_id !== supplierId) {
                    throw new Error('Batch does not belong to selected supplier');
                }

                const invRows = await db.inventory.where('batch_id').equals(ln.batchId).toArray();
                const onHand = invRows.reduce((s, r) => s + r.quantity, 0);
                if (onHand < ln.quantity) throw new Error(`Insufficient stock to return for batch ${batch.batch_number}`);

                const rate = batch.purchase_rate;
                const lineTotal = Math.round(ln.quantity * rate * 100) / 100;
                totalValue += lineTotal;

                const targetInv = invRows[0];
                const newQty = targetInv.quantity - ln.quantity;
                await db.inventory.update(targetInv.id, {
                    quantity: newQty,
                    updated_at: now,
                    last_modified: Date.now(),
                });
                await AuditService.log('inventory', targetInv.id, 'UPDATE', { qty: targetInv.quantity }, { qty: newQty, reason: 'Purchase return' });

                const prl: PurchaseReturnLine = {
                    id: uuidv4(),
                    return_id: returnId,
                    batch_id: batch.id,
                    product_id: batch.product_id,
                    quantity: ln.quantity,
                    rate,
                    created_at: now,
                    updated_at: now,
                    last_modified: Date.now(),
                };
                lineRows.push(prl);
            }

            const ret: PurchaseReturn = {
                id: returnId,
                supplier_id: supplierId,
                return_date: now.slice(0, 10),
                reference_note: referenceNote,
                status: 'POSTED',
                total_value: Math.round(totalValue * 100) / 100,
                created_at: now,
                updated_at: now,
                last_modified: Date.now(),
            };

            await db.purchase_returns.add(ret);
            for (const l of lineRows) {
                await db.purchase_return_lines.add(l);
            }
            await AuditService.log('purchase_returns', returnId, 'CREATE', null, ret);

            return ret;
        });

        await SupplierLedgerService.recordReturn(supplierId, header.id, header.total_value, `Purchase return ${header.reference_note || ''}`);
        await HydrationService.hydrateInventory();

        return header;
    },

    async listReturns(): Promise<PurchaseReturn[]> {
        return db.purchase_returns.orderBy('return_date').reverse().toArray();
    },
};
