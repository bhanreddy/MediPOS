import { apiClient, extractPaginated, type ApiPagination } from './client';
import type { AxiosResponse } from 'axios';

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

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

function normalizeSupplierRow(raw: Record<string, unknown>): Supplier {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    phone: raw.phone != null ? String(raw.phone) : '',
    email: raw.email != null ? String(raw.email) : '',
    gstNumber: raw.gstin != null ? String(raw.gstin) : '',
    drugLicenceNumber: raw.drug_licence_number != null ? String(raw.drug_licence_number) : '',
    address: raw.address != null ? String(raw.address) : '',
    outstandingBalance: Number(raw.outstanding_balance ?? 0),
    createdAt: String(raw.created_at ?? ''),
  };
}

interface OutstandingBackend {
  outstanding_balance: number;
  purchases?: Array<{
    id: string;
    invoice_number?: string | null;
    invoice_date?: string | null;
    net_amount?: number | string | null;
  }>;
}

function normalizeOutstanding(raw: OutstandingBackend): SupplierOutstandingData {
  const purchases = raw.purchases ?? [];
  return {
    totalOutstanding: Number(raw.outstanding_balance ?? 0),
    bills: purchases.map((p) => ({
      purchaseId: String(p.id ?? ''),
      billNumber: String(p.invoice_number ?? ''),
      amount: Number(p.net_amount ?? 0),
      dueDate: String(p.invoice_date ?? ''),
    })),
  };
}

/* ─── API ───────────────────────────────────────────── */

export const suppliersApi = {
  getSuppliers: async (params?: SupplierParams): Promise<PaginatedSuppliers> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[]; pagination: ApiPagination }>('/suppliers', {
      params,
    });
    const { data, pagination } = extractPaginated(res);
    return { data: data.map((row) => normalizeSupplierRow(row as Record<string, unknown>)), pagination };
  },

  getSupplier: async (id: string): Promise<Supplier> => {
    const res = await apiClient.get<{ data: Record<string, unknown> }>(`/suppliers/${id}`);
    return normalizeSupplierRow(extract(res) as Record<string, unknown>);
  },

  createSupplier: async (body: CreateSupplierBody): Promise<Supplier> => {
    const res = await apiClient.post<{ data: Record<string, unknown> }>('/suppliers', body);
    return normalizeSupplierRow(extract(res) as Record<string, unknown>);
  },

  updateSupplier: async (id: string, body: UpdateSupplierBody): Promise<Supplier> => {
    const res = await apiClient.put<{ data: Record<string, unknown> }>(`/suppliers/${id}`, body);
    return normalizeSupplierRow(extract(res) as Record<string, unknown>);
  },

  getSupplierOutstanding: async (id: string): Promise<SupplierOutstandingData> => {
    const res = await apiClient.get<{ data: OutstandingBackend }>(`/suppliers/${id}/outstanding`);
    return normalizeOutstanding(extract(res));
  },

  recordSupplierPayment: async (id: string, amount: number): Promise<Supplier> => {
    const res = await apiClient.post<{ data: Record<string, unknown> }>(`/suppliers/${id}/payment`, { amount });
    return normalizeSupplierRow(extract(res) as Record<string, unknown>);
  },
} as const;
