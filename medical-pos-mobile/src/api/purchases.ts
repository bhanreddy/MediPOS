import { apiClient } from './client';
import type { AxiosResponse } from 'axios';
import { queryAll, queryOne } from '../lib/localQuery';
import { localMutate } from '../lib/localMutate';
import type { ApiPagination } from './client';

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
  const paymentStatus = String(raw.payment_status ?? '');
  return {
    id: String(raw.id ?? raw._local_id ?? ''),
    billNumber: String(raw.invoice_number ?? ''),
    supplierId: String(raw.supplier_id ?? ''),
    supplierName: String(raw.supplier_name ?? ''),
    items: [],
    subtotal: toNum(raw.subtotal),
    gstTotal: toNum(raw.gst_amount),
    grandTotal: toNum(raw.net_amount),
    amountPaid: toNum(raw.paid_amount),
    paymentStatus,
    status: paymentStatus || String(raw.status ?? ''),
    createdAt: String(raw.created_at ?? raw._updated_at ?? ''),
  };
}

/* ─── API ───────────────────────────────────────────── */

export const purchasesApi = {
  getPurchases: async (params?: PurchaseParams): Promise<PaginatedPurchases> => {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params?.supplier_id) { conditions.push('supplier_id=?'); values.push(params.supplier_id); }
    if (params?.status) { conditions.push('payment_status=?'); values.push(params.status); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const rows = await queryAll<Record<string, unknown>>('purchases', where, values);

    // Attach supplier name
    for (const row of rows) {
      if (row.supplier_id) {
        const supp = await queryOne<Record<string, unknown>>('suppliers', '_local_id=? OR id=?', [row.supplier_id as string, row.supplier_id as string]);
        (row as any).supplier_name = supp?.name ?? '';
      }
    }

    rows.sort((a, b) => String(b.created_at ?? b._updated_at ?? '').localeCompare(String(a.created_at ?? a._updated_at ?? '')));

    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const offset = (page - 1) * limit;
    const paged = rows.slice(offset, offset + limit);

    return {
      data: paged.map(normalizePurchaseRow),
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
    };
  },

  getPurchase: async (id: string): Promise<PurchaseDetail> => {
    const row = await queryOne<Record<string, unknown>>('purchases', '_local_id=? OR id=?', [id, id]);
    if (!row) throw new Error('Purchase not found');

    const purchaseId = row._local_id ?? row.id;
    const itemRows = await queryAll<Record<string, unknown>>('purchase_items', 'purchase_id=?', [purchaseId as string]);

    // Attach medicine names to items
    const purchase_items: PurchaseLineItemRow[] = [];
    for (const item of itemRows) {
      let medicineName = '';
      if (item.medicine_id) {
        const med = await queryOne<Record<string, unknown>>('medicines', '_local_id=? OR id=?', [item.medicine_id as string, item.medicine_id as string]);
        medicineName = String(med?.name ?? '');
      }
      purchase_items.push({
        medicine_id: String(item.medicine_id ?? ''),
        batch_number: String(item.batch_number ?? ''),
        expiry_date: String(item.expiry_date ?? ''),
        quantity: Number(item.quantity ?? 0),
        purchase_price: Number(item.purchase_price ?? 0),
        mrp: Number(item.mrp ?? 0),
        gst_rate: Number(item.gst_rate ?? 0),
        medicines: { name: medicineName },
      });
    }

    let supplierName = '';
    if (row.supplier_id) {
      const supp = await queryOne<Record<string, unknown>>('suppliers', '_local_id=? OR id=?', [row.supplier_id as string, row.supplier_id as string]);
      supplierName = String(supp?.name ?? '');
    }

    return {
      id: String(row.id ?? row._local_id ?? ''),
      invoice_number: row.invoice_number as string,
      invoice_date: row.invoice_date as string,
      subtotal: row.subtotal as number,
      gst_amount: row.gst_amount as number,
      net_amount: row.net_amount as number,
      paid_amount: row.paid_amount as number,
      payment_status: row.payment_status as string,
      created_at: String(row.created_at ?? row._updated_at ?? ''),
      supplier_id: row.supplier_id as string,
      purchase_items,
      suppliers: { name: supplierName },
    };
  },

  createPurchase: async (body: CreatePurchaseBody): Promise<Purchase> => {
    const { items, ...purchaseData } = body;
    const purchase = await localMutate({ table: 'purchases', operation: 'INSERT', data: purchaseData });

    for (const item of items) {
      await localMutate({
        table: 'purchase_items',
        operation: 'INSERT',
        data: { ...item, purchase_id: purchase._local_id }
      });

      // Increment stock on batch (create or update)
      const existingBatch = await queryOne<Record<string, any>>(
        'medicine_batches',
        'medicine_id=? AND batch_number=?',
        [item.medicine_id, item.batch_number]
      );

      if (existingBatch) {
        await localMutate({
          table: 'medicine_batches',
          operation: 'UPDATE',
          data: {
            _local_id: existingBatch._local_id,
            quantity_remaining: Number(existingBatch.quantity_remaining ?? 0) + item.quantity,
          }
        });
      } else {
        await localMutate({
          table: 'medicine_batches',
          operation: 'INSERT',
          data: {
            medicine_id: item.medicine_id,
            purchase_id: purchase._local_id,
            batch_number: item.batch_number,
            expiry_date: item.expiry_date,
            quantity_in: item.quantity,
            quantity_remaining: item.quantity,
            purchase_price: item.purchase_price,
            mrp: item.mrp,
          }
        });
      }
    }

    return normalizePurchaseRow(purchase as Record<string, unknown>);
  },

  updatePayment: async (id: string, body: UpdatePaymentBody): Promise<PurchaseDetail> => {
    const record = await localMutate({ table: 'purchases', operation: 'UPDATE', data: { ...body, _local_id: id } });
    return record as unknown as PurchaseDetail;
  },

  scanBill: async (imageBase64: string, mimeType: string): Promise<BillScanResult> => {
    // scanBill requires network — sends image to Claude AI on the server
    const res = await apiClient.post<{ data: BillScanResult }>('/purchases/bill-scan', {
      imageBase64,
      mimeType,
    });
    return extract(res);
  },
} as const;
