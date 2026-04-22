import { apiClient, extractPaginated, type ApiPagination } from './client';
import type { AxiosResponse } from 'axios';

export type { ApiPagination };

/* ─── Types ─────────────────────────────────────────── */

export interface PurchaseItem {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  mrp: number;
  gstRate: number;
}

export interface Purchase {
  id: string;
  billNumber: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  subtotal: number;
  gstTotal: number;
  grandTotal: number;
  amountPaid: number;
  paymentStatus: string;
  status: string;
  createdAt: string;
}

/** Supabase `purchase_items` row + optional `medicines` join from GET /purchases/:id */
export interface PurchaseLineItemRow {
  medicine_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  mrp: number;
  gst_rate: number;
  medicines?: { name?: string | null; generic_name?: string | null } | null;
}

/**
 * GET /purchases/:id — Supabase row + `purchase_items`, optional `suppliers` join.
 * Numeric fields may be strings from Postgres; camelCase duplicates appear in some mocks.
 */
export interface PurchaseDetail {
  id: string;
  paid_amount?: number | string | null;
  net_amount?: number | string | null;
  gst_amount?: number | string | null;
  subtotal?: number | string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  supplier_id?: string | null;
  purchase_items?: PurchaseLineItemRow[];
  suppliers?: { name?: string | null } | null;
  /** Legacy / list-view camelCase */
  billNumber?: string;
  supplierName?: string;
  supplierId?: string;
  items?: PurchaseItem[];
  gstTotal?: number | string | null;
  grandTotal?: number | string | null;
  amountPaid?: number | string | null;
  paymentStatus?: string | null;
  createdAt?: string | null;
}

export interface PaginatedPurchases {
  data: Purchase[];
  pagination: ApiPagination;
}

interface PurchaseParams {
  page?: number;
  limit?: number;
  supplier_id?: string;
  status?: string;
}

/** Matches `createPurchaseSchema` (`Medical POS Backend`). */
export interface CreatePurchaseItemBody {
  medicine_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  mrp: number;
  gst_rate: number;
  discount?: number;
}

export interface CreatePurchaseBody {
  supplier_id?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  bill_image_url?: string | null;
  notes?: string | null;
  items: CreatePurchaseItemBody[];
}

/** One line from the Record Purchase screen before mapping to API. */
export interface PurchaseFormLineInput {
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  mrp: number;
  gstRate: number;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Backend requires `YYYY-MM-DD`. Accepts full date or `YYYY-MM` (→ first of month). */
export function normalizeExpiryDateForApi(input: string): string | null {
  const t = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  const m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}

function clampGstRate(n: number): number {
  const allowed: number[] = [0, 5, 12, 18];
  if (allowed.includes(n)) return n;
  return allowed.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), 12);
}

/**
 * Builds POST `/purchases` JSON. Throws `Error` with a clear message if validation fails.
 */
export function buildCreatePurchaseBody(params: {
  supplierId?: string | null;
  invoiceNumber: string;
  invoiceDate?: string | null;
  notes?: string | null;
  items: PurchaseFormLineInput[];
}): CreatePurchaseBody {
  const supplierRaw = params.supplierId?.trim();
  const supplier_id =
    supplierRaw && UUID_RE.test(supplierRaw) ? supplierRaw : null;

  const items: CreatePurchaseItemBody[] = params.items.map((line, idx) => {
    const mid = line.medicineId.trim();
    if (!UUID_RE.test(mid)) {
      throw new Error(`Line ${idx + 1}: choose a medicine from inventory (valid medicine ID).`);
    }
    const expiry = normalizeExpiryDateForApi(line.expiryDate);
    if (!expiry) {
      throw new Error(`Line ${idx + 1}: expiry must be YYYY-MM-DD, YYYY-MM, or MM/YYYY.`);
    }
    const qty = Math.floor(Number(line.quantity));
    const pp = Number(line.purchasePrice);
    const mrp = Number(line.mrp);
    if (!(qty > 0) || !(pp > 0) || !(mrp > 0)) {
      throw new Error(`Line ${idx + 1}: quantity, purchase price, and MRP must be positive numbers.`);
    }
    return {
      medicine_id: mid,
      batch_number: line.batchNumber.trim(),
      expiry_date: expiry,
      quantity: qty,
      purchase_price: pp,
      mrp,
      gst_rate: clampGstRate(Number(line.gstRate) || 0),
      discount: 0,
    };
  });

  const invoice_number = params.invoiceNumber.trim() || null;

  let invoice_date: string | undefined;
  if (params.invoiceDate?.trim()) {
    const parsed = normalizeExpiryDateForApi(params.invoiceDate.trim());
    if (!parsed) throw new Error('Invoice date must be YYYY-MM-DD, YYYY-MM, or MM/YYYY.');
    invoice_date = parsed;
  }

  const body: CreatePurchaseBody = {
    supplier_id,
    invoice_number,
    items,
    notes: params.notes?.trim() || null,
  };
  if (invoice_date !== undefined) body.invoice_date = invoice_date;
  return body;
}

/** Matches Medical POS Backend updatePaymentSchema (purchase.schema.ts). */
export interface UpdatePaymentBody {
  paid_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
}

/** Parsed bill shape from backend Claude extraction (nested under response `data`). */
interface BillScanResult {
  supplierName: string;
  billNumber: string;
  items: Array<{
    name: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    purchasePrice: number;
    mrp: number;
  }>;
  total: number;
}

/* ─── Helpers ───────────────────────────────────────── */

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Map a purchase header from the API (GET list or single row) to UI `Purchase`.
 * Backend uses snake_case (`invoice_number`, `net_amount`, nested `suppliers`).
 */
export function normalizePurchaseRow(raw: Record<string, unknown>): Purchase {
  const suppliers = raw.suppliers as { name?: string | null } | undefined;
  const paymentStatus = String(raw.payment_status ?? '');
  return {
    id: String(raw.id ?? ''),
    billNumber: String(raw.invoice_number ?? ''),
    supplierId: String(raw.supplier_id ?? ''),
    supplierName: suppliers?.name != null ? String(suppliers.name) : '',
    items: [],
    subtotal: toNum(raw.subtotal),
    gstTotal: toNum(raw.gst_amount),
    grandTotal: toNum(raw.net_amount),
    amountPaid: toNum(raw.paid_amount),
    paymentStatus,
    status: paymentStatus || String(raw.status ?? ''),
    createdAt: String(raw.created_at ?? ''),
  };
}

/* ─── API ───────────────────────────────────────────── */

export const purchasesApi = {
  getPurchases: async (params?: PurchaseParams): Promise<PaginatedPurchases> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[]; pagination: ApiPagination }>('/purchases', {
      params,
    });
    const { data, pagination } = extractPaginated(res);
    return {
      data: data.map((row) => normalizePurchaseRow(row as Record<string, unknown>)),
      pagination,
    };
  },

  getPurchase: async (id: string): Promise<PurchaseDetail> => {
    const res = await apiClient.get<{ data: PurchaseDetail }>(`/purchases/${id}`);
    return extract(res);
  },

  createPurchase: async (body: CreatePurchaseBody): Promise<Purchase> => {
    const res = await apiClient.post<{ data: Record<string, unknown> }>('/purchases', body);
    return normalizePurchaseRow(extract(res) as Record<string, unknown>);
  },

  updatePayment: async (id: string, body: UpdatePaymentBody): Promise<PurchaseDetail> => {
    const res = await apiClient.patch<{ data: PurchaseDetail }>(`/purchases/${id}/payment`, body);
    return extract(res);
  },

  scanBill: async (imageBase64: string, mimeType: string): Promise<BillScanResult> => {
    const res = await apiClient.post<{ data: BillScanResult }>('/purchases/bill-scan', {
      imageBase64,
      mimeType,
    });
    return extract(res);
  },
} as const;
