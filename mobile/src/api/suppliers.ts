import { apiClient } from './client';
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

/* ─── API — Remote reads, writes disabled on mobile ── */

export const suppliersApi = {
  getSuppliers: async (params?: SupplierParams): Promise<PaginatedSuppliers> => {
    const res = await apiClient.get('/suppliers', { params });
    const raw = res.data;
    return {
      data: (raw.data ?? []).map((r: Record<string, unknown>) => normalizeSupplierRow(r)),
      pagination: raw.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  },

  getSupplier: async (id: string): Promise<Supplier> => {
    const res = await apiClient.get(`/suppliers/${id}`);
    return normalizeSupplierRow(res.data.data ?? res.data);
  },

  /** DISABLED on mobile */
  createSupplier: async (_body: CreateSupplierBody): Promise<Supplier> => {
    throw new Error('Supplier creation is disabled on mobile. Use the desktop app.');
  },

  /** DISABLED on mobile */
  updateSupplier: async (_id: string, _body: UpdateSupplierBody): Promise<Supplier> => {
    throw new Error('Supplier updates are disabled on mobile. Use the desktop app.');
  },

  getSupplierOutstanding: async (id: string): Promise<SupplierOutstandingData> => {
    const res = await apiClient.get(`/suppliers/${id}/outstanding`);
    const raw = res.data.data ?? res.data;
    return {
      totalOutstanding: Number(raw.totalOutstanding ?? raw.total_outstanding ?? 0),
      bills: (raw.bills ?? []).map((p: Record<string, unknown>) => ({
        purchaseId: String(p.purchaseId ?? p.purchase_id ?? p.id ?? ''),
        billNumber: String(p.billNumber ?? p.invoice_number ?? ''),
        amount: Number(p.amount ?? p.net_amount ?? 0),
        dueDate: String(p.dueDate ?? p.invoice_date ?? ''),
      })),
    };
  },

  /** DISABLED on mobile */
  recordSupplierPayment: async (_id: string, _amount: number): Promise<Supplier> => {
    throw new Error('Supplier payments are disabled on mobile. Use the desktop app.');
  },
} as const;
