import api from '../lib/api';
import type { PurchaseReturn } from '../core/types';

export interface PurchaseReturnLineInput {
    batchId: string;
    quantity: number;
}

export const PurchaseReturnService = {
    async postReturn(supplierId: string, lines: PurchaseReturnLineInput[], referenceNote: string): Promise<PurchaseReturn> {
        if (!lines.length) throw new Error('Return needs at least one line');
        const res = await api.post('/purchases/purchase-returns', {
            supplier_id: supplierId,
            reference_note: referenceNote,
            lines
        });
        const created = res.data?.data;
        return {
            ...created,
            id: created._local_id || created.id
        };
    },

    async listReturns(): Promise<PurchaseReturn[]> {
        const res = await api.get('/purchases/purchase-returns');
        return res.data?.data || [];
    },
};
