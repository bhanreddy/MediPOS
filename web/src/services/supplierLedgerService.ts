import api from '../lib/api';
import type { SupplierLedgerEntry } from '../core/types';

const pendingPayments=new Map<string,string>();

export const SupplierLedgerService = {
    async recordPurchase(_supplierId: string, _purchaseId: string, _amount: number, _description: string): Promise<void> {
        // Handled automatically on the backend during purchase creation
    },

    async recordPayment(supplierId: string, amount: number, description: string): Promise<void> {
        const signature=JSON.stringify([supplierId,amount,description]);
        const requestId=pendingPayments.get(signature)||crypto.randomUUID();pendingPayments.set(signature,requestId);
        await api.post(`/suppliers/${supplierId}/payment`, { amount, note:description, payment_mode:'cash', _local_id:requestId }, {'axios-retry':{retries:0}});
        pendingPayments.delete(signature);
    },

    async recordReturn(_supplierId: string, _returnId: string, _amount: number, _description: string): Promise<void> {
        // Handled automatically on the backend during return posting
    },

    async listBySupplier(supplierId: string): Promise<SupplierLedgerEntry[]> {
        const res = await api.get(`/suppliers/${supplierId}/outstanding`);
        const ledger=res.data?.data?.ledger;
        if(ledger?.length)return ledger.map((entry:any)=>({id:entry.id,supplier_id:supplierId,entry_type:entry.transaction_type==='PAYMENT'?'PAYMENT':'PURCHASE',reference_id:entry.reference_id,description:entry.notes||entry.reference_number||entry.transaction_type,debit:Number(entry.credit_paise)/100,credit:Number(entry.debit_paise)/100,entry_date:String(entry.created_at).slice(0,10),created_at:entry.created_at,updated_at:entry.updated_at,last_modified:Date.now()}));
        const purchases = res.data?.data?.purchases || [];
        return purchases.map((p: any) => ({
            id: p.id || p._local_id,
            supplier_id: supplierId,
            entry_type: 'PURCHASE',
            reference_id: p.id || p._local_id,
            description: `Invoice: ${p.invoice_number || 'N/A'}`,
            debit: Number(p.net_amount || 0),
            credit: Number(p.paid_amount || 0),
            entry_date: p.invoice_date || p.created_at?.slice(0, 10),
            created_at: p.created_at,
            updated_at: p.updated_at,
            last_modified: Date.now()
        }));
    },

    async outstandingPayable(supplierId: string): Promise<number> {
        const res = await api.get(`/suppliers/${supplierId}/outstanding`);
        return Number(res.data?.data?.outstanding_balance || 0);
    },
};
