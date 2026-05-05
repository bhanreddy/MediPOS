import { queryAll, queryOne } from '../lib/localQuery';
import { localMutate } from '../lib/localMutate';
import type { ApiPagination } from './client';

export type { ApiPagination };

/* ─── Types ─────────────────────────────────────────── */

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstNumber: string;
  drugLicenceNumber: string;
  address: string;
  outstandingBalance: number;
  createdAt: string;
}

export interface PaginatedSuppliers {
  data: Supplier[];
  pagination: ApiPagination;
}

interface SupplierParams {
  q?: string;
  page?: number;
}

/** POST/PUT — matches `supplier.schema` */
export interface CreateSupplierBody {
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  drug_licence_number?: string | null;
  address?: string | null;
}

export type UpdateSupplierBody = Partial<CreateSupplierBody>;

export interface SupplierOutstandingData {
  totalOutstanding: number;
  bills: Array<{
    purchaseId: string;
    billNumber: string;
    amount: number;
    dueDate: string;
  }>;
}

/* ─── Helpers ───────────────────────────────────────── */

function normalizeSupplierRow(raw: Record<string, unknown>): Supplier {
  return {
    id: String(raw.id ?? raw._local_id ?? ''),
    name: String(raw.name ?? ''),
    phone: raw.phone != null ? String(raw.phone) : '',
    email: raw.email != null ? String(raw.email) : '',
    gstNumber: raw.gstin != null ? String(raw.gstin) : '',
    drugLicenceNumber: raw.drug_licence_number != null ? String(raw.drug_licence_number) : '',
    address: raw.address != null ? String(raw.address) : '',
    outstandingBalance: Number(raw.outstanding_balance ?? 0),
    createdAt: String(raw.created_at ?? raw._updated_at ?? ''),
  };
}

/* ─── API ───────────────────────────────────────────── */

export const suppliersApi = {
  getSuppliers: async (params?: SupplierParams): Promise<PaginatedSuppliers> => {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params?.q) {
      conditions.push('name LIKE ?');
      values.push(`%${params.q}%`);
    }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const rows = await queryAll<Record<string, unknown>>('suppliers', where, values);

    rows.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));

    const page = params?.page ?? 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const paged = rows.slice(offset, offset + limit);

    return {
      data: paged.map(normalizeSupplierRow),
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
    };
  },

  getSupplier: async (id: string): Promise<Supplier> => {
    const row = await queryOne<Record<string, unknown>>('suppliers', '_local_id=? OR id=?', [id, id]);
    if (!row) throw new Error('Supplier not found');
    return normalizeSupplierRow(row);
  },

  createSupplier: async (body: CreateSupplierBody): Promise<Supplier> => {
    const record = await localMutate({ table: 'suppliers', operation: 'INSERT', data: body });
    return normalizeSupplierRow(record as Record<string, unknown>);
  },

  updateSupplier: async (id: string, body: UpdateSupplierBody): Promise<Supplier> => {
    const existing = await queryOne<Record<string, unknown>>('suppliers', '_local_id=? OR id=?', [id, id]);
    const record = await localMutate({ table: 'suppliers', operation: 'UPDATE', data: { ...(existing ?? {}), ...body, _local_id: id } });
    return normalizeSupplierRow(record as Record<string, unknown>);
  },

  getSupplierOutstanding: async (id: string): Promise<SupplierOutstandingData> => {
    const supp = await queryOne<Record<string, unknown>>('suppliers', '_local_id=? OR id=?', [id, id]);
    const totalOutstanding = Number(supp?.outstanding_balance ?? 0);

    const suppId = supp?._local_id ?? supp?.id ?? id;
    const purchases = await queryAll<Record<string, unknown>>(
      'purchases',
      'supplier_id=? AND payment_status!=?',
      [suppId as string, 'paid']
    );

    return {
      totalOutstanding,
      bills: purchases.map(p => ({
        purchaseId: String(p.id ?? p._local_id ?? ''),
        billNumber: String(p.invoice_number ?? ''),
        amount: Number(p.net_amount ?? 0),
        dueDate: String(p.invoice_date ?? ''),
      })),
    };
  },

  recordSupplierPayment: async (id: string, amount: number): Promise<Supplier> => {
    const existing = await queryOne<Record<string, unknown>>('suppliers', '_local_id=? OR id=?', [id, id]);
    const currentBalance = Number(existing?.outstanding_balance ?? 0);
    const record = await localMutate({
      table: 'suppliers',
      operation: 'UPDATE',
      data: { outstanding_balance: currentBalance - amount, _local_id: id }
    });
    return normalizeSupplierRow(record as Record<string, unknown>);
  },
} as const;
