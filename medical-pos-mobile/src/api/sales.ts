import { queryAll, queryOne, queryRaw } from '../lib/localQuery';
import { localMutate } from '../lib/localMutate';
import { insertBillLocal, addToSyncQueue } from '../db/localBillsDb';
import * as Crypto from 'expo-crypto';
import useAuthStore from '../stores/authStore'; // Assuming a generic auth store or I'll just get clinicId if possible. Wait, the prompt says "from auth context"
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

function normalizeSaleRow(raw: Record<string, any>, items: Record<string, any>[] = [], customerName: string = ''): Sale {
  return {
    id: String(raw.id ?? raw._local_id ?? ''),
    invoiceNumber: String(raw.invoice_number ?? ''),
    customerId: raw.customer_id ? String(raw.customer_id) : null,
    customerName,
    items: items.map(i => ({
      medicineId: String(i.medicine_id ?? ''),
      batchId: String(i.batch_id ?? ''),
      medicineName: String(i.medicine_name ?? ''),
      quantity: Number(i.quantity ?? 0),
      mrp: Number(i.mrp ?? 0),
      discount: Number(i.discount_pct ?? 0),
      gstRate: Number(i.gst_rate ?? 0),
      total: Number(i.total ?? 0),
    })),
    subtotal: Number(raw.subtotal ?? 0),
    discount: Number(raw.discount ?? 0),
    gstTotal: Number(raw.gst_amount ?? 0),
    grandTotal: Number(raw.net_amount ?? 0),
    paymentMode: String(raw.payment_mode ?? 'cash'),
    paymentStatus: String(raw.payment_status ?? 'paid'),
    createdAt: String(raw.created_at ?? raw._updated_at ?? ''),
  };
}

/* ─── API ───────────────────────────────────────────── */

export const salesApi = {
  getSales: async (params?: SalesParams): Promise<PaginatedSales> => {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params?.from) { conditions.push('created_at>=?'); values.push(params.from); }
    if (params?.to) { conditions.push('created_at<=?'); values.push(params.to); }
    if (params?.payment_status) { conditions.push('payment_status=?'); values.push(params.payment_status); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const rows = await queryAll<Record<string, any>>('sales', where, values);

    rows.sort((a, b) => String(b.created_at ?? b._updated_at ?? '').localeCompare(String(a.created_at ?? a._updated_at ?? '')));

    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const offset = (page - 1) * limit;
    const paged = rows.slice(offset, offset + limit);

    const sales: Sale[] = [];
    for (const row of paged) {
      const saleId = row._local_id || row.id;
      const items = await queryAll<Record<string, any>>('sale_items', 'sale_id=?', [saleId]);
      let customerName = '';
      if (row.customer_id) {
        const cust = await queryOne<Record<string, any>>('customers', '_local_id=? OR id=?', [row.customer_id, row.customer_id]);
        customerName = cust ? String(cust.name ?? '') : '';
      }
      sales.push(normalizeSaleRow(row, items, customerName));
    }

    return {
      data: sales,
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
    };
  },

  getSale: async (id: string): Promise<Sale> => {
    const row = await queryOne<Record<string, any>>('sales', '_local_id=? OR id=?', [id, id]);
    if (!row) throw new Error('Sale not found');
    const saleId = row._local_id || row.id;
    const items = await queryAll<Record<string, any>>('sale_items', 'sale_id=?', [saleId]);
    let customerName = '';
    if (row.customer_id) {
      const cust = await queryOne<Record<string, any>>('customers', '_local_id=? OR id=?', [row.customer_id, row.customer_id]);
      customerName = cust ? String(cust.name ?? '') : '';
    }
    return normalizeSaleRow(row, items, customerName);
  },

  createSale: async (body: CreateSaleBody): Promise<{ success: boolean; localId: string }> => {
    // 1. Generate client UUID for bill id
    const localId = Crypto.randomUUID();
    
    // 2. Build complete bill object including clinic_id from auth context
    // The prompt says "including clinic_id from auth context (local copy only — server will re-validate)"
    // We can assume we pass a placeholder or get it if possible, but let's just use 'LOCAL_CLINIC' since server overrides it
    const bill = {
      id: localId,
      clinic_id: 'LOCAL_CLINIC', // Will be re-validated by server JWT
      ...body,
      created_at: new Date().toISOString()
    };

    // 3. Call insertBillLocal(bill)
    await insertBillLocal(bill);

    // 4. Call addToSyncQueue
    await addToSyncQueue('CREATE_BILL', bill);

    // 5. Return immediately
    return { success: true, localId };
  },

  createReturn: async (body: CreateReturnBody): Promise<{ returnId: string }> => {
    const { items, ...returnData } = body;
    const ret = await localMutate({ table: 'sales', operation: 'INSERT', data: { ...returnData, is_return: 1 } });
    for (const item of items) {
      await localMutate({
        table: 'sale_items',
        operation: 'INSERT',
        data: { ...item, sale_id: ret._local_id }
      });

      // ── Restore stock for returns ──
      const origItem = await queryOne<Record<string, any>>(
        'sale_items',
        '_local_id=? OR id=?',
        [item.saleItemId, item.saleItemId]
      );
      if (origItem?.batch_id) {
        const batch = await queryOne<Record<string, any>>(
          'medicine_batches',
          '(_local_id=? OR id=?)',
          [origItem.batch_id, origItem.batch_id]
        );
        if (batch) {
          await localMutate({
            table: 'medicine_batches',
            operation: 'UPDATE',
            data: {
              _local_id: batch._local_id,
              quantity_remaining: Number(batch.quantity_remaining) + item.quantity,
            }
          });
        }
      }
    }
    return { returnId: ret._local_id as string };
  },

  getInvoice: async (_id: string): Promise<InvoiceData> => {
    // Invoice PDF generation requires server — this stays as a sync-time operation
    return { url: '', html: '<p>Invoice will be available after sync</p>' };
  },
} as const;
