import { db } from '../db/index';
import type { PurchaseOrder, PurchaseOrderLine } from '../core/types';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './auditService';

export const PurchaseOrderService = {
    async create(supplierId: string, lines: PurchaseOrderLine[], notes?: string): Promise<PurchaseOrder> {
        if (!lines.length) throw new Error('PO requires at least one line');
        const now = new Date().toISOString();
        const count = await db.purchase_orders.count();
        const po: PurchaseOrder = {
            id: uuidv4(),
            supplier_id: supplierId,
            po_number: `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`,
            status: 'DRAFT',
            order_date: now.slice(0, 10),
            notes,
            lines_json: JSON.stringify(lines),
            created_at: now,
            updated_at: now,
            last_modified: Date.now(),
        };
        await db.purchase_orders.add(po);
        await AuditService.log('purchase_orders', po.id, 'CREATE', null, po);
        return po;
    },

    async list(): Promise<PurchaseOrder[]> {
        return db.purchase_orders.orderBy('order_date').reverse().toArray();
    },

    async updateStatus(id: string, status: PurchaseOrder['status']): Promise<void> {
        const row = await db.purchase_orders.get(id);
        if (!row) throw new Error('PO not found');
        const now = new Date().toISOString();
        const next = { ...row, status, updated_at: now, last_modified: Date.now() };
        await db.purchase_orders.put(next);
        await AuditService.log('purchase_orders', id, 'UPDATE', row, next);
    },

    parseLines(row: PurchaseOrder): PurchaseOrderLine[] {
        try {
            const parsed = JSON.parse(row.lines_json) as PurchaseOrderLine[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    },
};
