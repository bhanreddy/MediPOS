import api from '../lib/api';
import type { Customer } from '../core/types';

export interface PurchaseLine {
  id: string;
  medicine_id: string;
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  gst_rate?: number;
  total: number;
  medicines?: { name?: string };
  medicine_batches?: { batch_number?: string; expiry_date?: string };
}
export interface CustomerInvoice {
  id: string;
  customer_id: string;
  invoice_number: string;
  created_at: string;
  net_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: string;
  payment_status: string;
  is_return?: boolean;
  wallet_redeemed_paise?: number;
  nex_coins_earned_paise?: number;
  nex_coins_expires_at?: string;
  original_sale_id?: string;
  sale_items: PurchaseLine[];
}
export interface HistoryFilters { page: number; from?: string; to?: string; medicineId?: string }
export const HISTORY_PAGE_SIZE = 8;

export const CustomerHistoryService = {
  async getCustomer(id: string, signal?: AbortSignal): Promise<Customer> {
    const res = await api.get(`/customers/${encodeURIComponent(id)}`, { signal });
    return res.data.data;
  },
  async getHistory(customer: Customer, filters: HistoryFilters, signal?: AbortSignal) {
    const params: Record<string, string | number> = {
      customer_id: customer.id, page: filters.page, limit: HISTORY_PAGE_SIZE,
    };
    if (filters.from) params.from = new Date(`${filters.from}T00:00:00`).toISOString();
    if (filters.to) params.to = new Date(`${filters.to}T23:59:59.999`).toISOString();
    if (filters.medicineId) params.medicine_id = filters.medicineId;
    const res = await api.get('/sales', { params, signal });
    const aliases = new Set([customer.id, customer._local_id].filter(Boolean));
    const rows: CustomerInvoice[] = res.data.data || [];
    // Never display another customer's invoices, including when an older API ignores filters.
    if (rows.some(row => !aliases.has(row.customer_id))) throw new Error('Customer history could not be verified');
    const invoices: CustomerInvoice[] = new Array(rows.length);
    let next = 0;
    // Bound detail requests; only the visible page is fetched, never the entire store's history.
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
      while (next < rows.length) {
        const index = next++;
        const detail = await api.get(`/sales/${encodeURIComponent(rows[index].id)}`, { signal });
        const invoice: CustomerInvoice = detail.data.data;
        if (!aliases.has(invoice.customer_id)) throw new Error('Customer history could not be verified');
        invoices[index] = invoice;
      }
    }));
    return { invoices, total: Number(res.data.pagination?.total || 0) };
  },
  async findMedicines(q: string, signal?: AbortSignal): Promise<{ id: string; name: string }[]> {
    const res = await api.get('/inventory/medicines', { params: { q, limit: 10 }, signal });
    return (res.data.data || []).slice(0, 10).map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }));
  },
};
