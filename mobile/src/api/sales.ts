import { apiClient } from './client';
import type { ApiPagination } from './client';

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
  medicine_id?: string;
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

const ALLOWED_GST_RATES = [0, 5, 12, 18] as const;
type AllowedGstRate = (typeof ALLOWED_GST_RATES)[number];

function normalizeGstRate(rate: number): AllowedGstRate {
  const rounded = Math.round(Number(rate) || 0);
  return (ALLOWED_GST_RATES.includes(rounded as AllowedGstRate) ? rounded : 0) as AllowedGstRate;
}

/** Build POST /sales body — mirrors web `BillingService.finalizeSale` + backend `createSaleSchema`. */
export function buildCreateSalePayload(body: CreateSaleBody): CreateSaleBody {
  let subtotal = 0;
  let gst_amount = 0;

  const items = body.items.map((item) => {
    const qty = Math.max(1, Math.floor(Number(item.quantity)));
    const mrp = Number(item.mrp);
    const discount_pct = Math.min(100, Math.max(0, Number(item.discount_pct ?? 0)));
    const gst_rate = normalizeGstRate(item.gst_rate);

    subtotal += qty * mrp * (1 - discount_pct / 100);
    gst_amount += (qty * mrp * gst_rate) / 100;

    return {
      medicine_id: String(item.medicine_id),
      batch_id: String(item.batch_id),
      quantity: qty,
      mrp,
      discount_pct,
      gst_rate,
    };
  });

  const discount = Math.max(0, Number(body.discount ?? 0));
  const net_amount = subtotal - discount + gst_amount;

  let paid_amount = Number(body.paid_amount);
  let payment_status = body.payment_status;
  if (body.payment_mode === 'credit') {
    paid_amount = 0;
    payment_status = 'credit';
  } else if (payment_status === 'paid') {
    paid_amount = net_amount;
  }

  return {
    ...(body.customer_id ? { customer_id: body.customer_id } : {}),
    discount,
    payment_mode: body.payment_mode,
    payment_status,
    paid_amount,
    items,
  };
}

function extractApiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d.message === 'string') return d.message;
      if (typeof d.error === 'string') return d.error;
      if (d.error && typeof d.error === 'object' && typeof (d.error as { message?: string }).message === 'string') {
        return (d.error as { message: string }).message;
      }
    }
  }
  if (error instanceof Error) return error.message;
  return 'Failed to create sale';
}

/* ─── Helpers ───────────────────────────────────────── */

function normalizeSaleRow(raw: Record<string, any>): Sale {
  const items: SaleItem[] = (raw.items ?? []).map((i: Record<string, any>) => ({
    medicineId: String(i.medicine_id ?? ''),
    batchId: String(i.batch_id ?? ''),
    medicineName: String(i.medicine_name ?? i.medicineName ?? ''),
    quantity: Number(i.quantity ?? 0),
    mrp: Number(i.mrp ?? 0),
    discount: Number(i.discount_pct ?? i.discount ?? 0),
    gstRate: Number(i.gst_rate ?? i.gstRate ?? 0),
    total: Number(i.total ?? 0),
  }));

  return {
    id: String(raw.id ?? ''),
    invoiceNumber: String(raw.invoice_number ?? raw.invoiceNumber ?? ''),
    customerId: raw.customer_id ? String(raw.customer_id) : null,
    customerName: String(raw.customer_name ?? raw.customerName ?? ''),
    items,
    subtotal: Number(raw.subtotal ?? 0),
    discount: Number(raw.discount ?? 0),
    gstTotal: Number(raw.gst_amount ?? raw.gstTotal ?? 0),
    grandTotal: Number(raw.net_amount ?? raw.grandTotal ?? 0),
    paymentMode: String(raw.payment_mode ?? raw.paymentMode ?? 'cash'),
    paymentStatus: String(raw.payment_status ?? raw.paymentStatus ?? 'paid'),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
  };
}

/* ─── API — All reads from remote ────────────────────── */

export const salesApi = {
  /**
   * Fetch sales from the remote backend API.
   */
  getSales: async (params?: SalesParams): Promise<PaginatedSales> => {
    const res = await apiClient.get('/sales', { params });
    const raw = res.data;

    return {
      data: (raw.data ?? []).map((r: Record<string, any>) => normalizeSaleRow(r)),
      pagination: raw.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  },

  /**
   * Fetch a single sale from the remote backend API.
   */
  getSale: async (id: string): Promise<Sale> => {
    const res = await apiClient.get(`/sales/${id}`);
    return normalizeSaleRow(res.data.data ?? res.data);
  },

  /**
   * Create a sale via POST /sales (same contract as web BillingService.finalizeSale).
   */
  createSale: async (body: CreateSaleBody): Promise<{ success: boolean; localId: string }> => {
    try {
      const payload = buildCreateSalePayload(body);
      const res = await apiClient.post('/sales', payload);
      const sale = res.data?.data ?? res.data;
      const localId = String(sale?._local_id ?? sale?.id ?? '');
      if (!localId) {
        throw new Error('Sale created but no id returned');
      }
      return { success: true, localId };
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /**
   * DISABLED on mobile — returns are processed from the desktop only.
   */
  createReturn: async (_body: CreateReturnBody): Promise<{ returnId: string }> => {
    throw new Error('Returns are disabled on mobile. Use the desktop app.');
  },

  /**
   * Fetch invoice data from the remote backend API.
   */
  getInvoice: async (id: string): Promise<InvoiceData> => {
    const res = await apiClient.get(`/sales/${id}/invoice`);
    const raw = res.data?.data ?? res.data;
    return {
      url: String(raw?.url ?? ''),
      html: String(raw?.html ?? ''),
    };
  },
} as const;
