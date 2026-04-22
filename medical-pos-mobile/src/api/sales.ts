import { apiClient, extractPaginated, type ApiPagination } from './client';
import type { AxiosResponse } from 'axios';

export type { ApiPagination };

/* ─── Types ─────────────────────────────────────────── */

export interface SaleItem {
  medicineId: string;
  batchId: string;
  medicineName: string;
  quantity: number;
  mrp: number;
  discount: number;
  gstRate: number;
  total: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  gstTotal: number;
  grandTotal: number;
  paymentMode: string;
  paymentStatus: string;
  createdAt: string;
}

export interface PaginatedSales {
  data: Sale[];
  pagination: ApiPagination;
}

interface SalesParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  payment_status?: string;
}

/** Matches Medical POS Backend createSaleSchema (sale.schema.ts) — wire format only (snake_case). */
export interface CreateSaleBody {
  customer_id?: string | null;
  discount: number;
  payment_mode: 'cash' | 'upi' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'credit';
  paid_amount: number;
  items: Array<{
    medicine_id: string;
    batch_id: string;
    quantity: number;
    mrp: number;
    discount_pct: number;
    gst_rate: number;
  }>;
}

interface CreateReturnBody {
  saleId: string;
  items: Array<{
    saleItemId: string;
    quantity: number;
    reason: string;
  }>;
}

interface InvoiceData {
  url: string;
  html: string;
}

/* ─── Helpers ───────────────────────────────────────── */

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

/* ─── API ───────────────────────────────────────────── */

export const salesApi = {
  getSales: async (params?: SalesParams): Promise<PaginatedSales> => {
    const res = await apiClient.get<{ data: Sale[]; pagination: ApiPagination }>('/sales', { params });
    return extractPaginated(res);
  },

  getSale: async (id: string): Promise<Sale> => {
    const res = await apiClient.get<{ data: Sale }>(`/sales/${id}`);
    return extract(res);
  },

  createSale: async (body: CreateSaleBody): Promise<Sale> => {
    const res = await apiClient.post<{ data: Sale }>('/sales', body);
    return extract(res);
  },

  createReturn: async (body: CreateReturnBody): Promise<{ returnId: string }> => {
    const res = await apiClient.post<{ data: { returnId: string } }>('/sales/returns', body);
    return extract(res);
  },

  getInvoice: async (id: string): Promise<InvoiceData> => {
    const res = await apiClient.get<{ data: InvoiceData }>(`/sales/${id}/invoice`);
    return extract(res);
  },
} as const;
