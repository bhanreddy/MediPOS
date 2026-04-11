import { db } from '../db/index';
import type { SupplierLedgerEntry } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './auditService';

export const SupplierLedgerService = {
    async recordPurchase(supplierId: string, purchaseId: string, amount: number, description: string): Promise<void> {
        const now = new Date().toISOString();
        const entry: SupplierLedgerEntry = {
            id: uuidv4(),
            supplier_id: supplierId,
            entry_type: 'PURCHASE',
            reference_id: purchaseId,
            description,
            debit: Math.round(amount * 100) / 100,
            credit: 0,
            entry_date: now.slice(0, 10),
            created_at: now,
            updated_at: now,
            last_modified: Date.now(),
        };
        await db.supplier_ledger_entries.add(entry);
        await AuditService.log('supplier_ledger_entries', entry.id, 'CREATE', null, entry);
    },

    async recordPayment(supplierId: string, amount: number, description: string): Promise<void> {
        const now = new Date().toISOString();
        const entry: SupplierLedgerEntry = {
            id: uuidv4(),
            supplier_id: supplierId,
            entry_type: 'PAYMENT',
            description,
            debit: 0,
            credit: Math.round(amount * 100) / 100,
            entry_date: now.slice(0, 10),
            created_at: now,
            updated_at: now,
            last_modified: Date.now(),
        };
        await db.supplier_ledger_entries.add(entry);
        await AuditService.log('supplier_ledger_entries', entry.id, 'CREATE', null, entry);
    },

    async recordReturn(supplierId: string, returnId: string, amount: number, description: string): Promise<void> {
        const now = new Date().toISOString();
        const entry: SupplierLedgerEntry = {
            id: uuidv4(),
            supplier_id: supplierId,
            entry_type: 'RETURN',
            reference_id: returnId,
            description,
            debit: 0,
            credit: Math.round(amount * 100) / 100,
            entry_date: now.slice(0, 10),
            created_at: now,
            updated_at: now,
            last_modified: Date.now(),
        };
        await db.supplier_ledger_entries.add(entry);
        await AuditService.log('supplier_ledger_entries', entry.id, 'CREATE', null, entry);
    },

    async listBySupplier(supplierId: string): Promise<SupplierLedgerEntry[]> {
        return db.supplier_ledger_entries.where('supplier_id').equals(supplierId).sortBy('entry_date');
    },

    async outstandingPayable(supplierId: string): Promise<number> {
        const rows = await this.listBySupplier(supplierId);
        let bal = 0;
        for (const r of rows) {
            bal += r.debit - r.credit;
        }
        return Math.round(bal * 100) / 100;
    },
};
