import api from '../lib/api';
import type { PurchaseOrder, PurchaseOrderLine } from '../core/types';

export const PurchaseOrderService = {
    async create(supplierId: string, lines: PurchaseOrderLine[], notes?: string): Promise<PurchaseOrder> {
        if (!lines.length) throw new Error('PO requires at least one line');
        const res = await api.post('/purchases/purchase-orders', {
            supplier_id: supplierId,
            notes,
            lines
        });
        const created = res.data?.data;
        return {
            ...created,
            id: created._local_id || created.id
        };
    },

    async list(): Promise<PurchaseOrder[]> {
        const res = await api.get('/purchases/purchase-orders');
        return res.data?.data || [];
    },

    async updateStatus(id: string, status: PurchaseOrder['status']): Promise<void> {
        await api.patch(`/purchases/purchase-orders/${id}/status`, { status });
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
