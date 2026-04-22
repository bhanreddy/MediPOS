import { apiClient, extractPaginated, type ApiPagination } from './client';
import type { AxiosResponse } from 'axios';

export type { ApiPagination };

/* ─── Types ─────────────────────────────────────────── */

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  /** Mapped from API `doctor_name` (DB has no GST field) */
  doctorName: string;
  outstandingBalance: number;
  lastPurchaseDate?: string;
  importanceScore?: number;
  createdAt: string;
}

export interface RecentSaleSummary {
  id: string;
  invoiceNumber: string;
  /** ISO-ish date string */
  saleDate: string;
  netAmount: number;
  paymentStatus: string;
  balanceDue: number;
  /** UI badge copy */
  status: string;
}

export interface CustomerDetail {
  customer: Customer;
  recent_sales: RecentSaleSummary[];
}

export interface PaginatedCustomers {
  data: Customer[];
  pagination: ApiPagination;
}

interface CustomerParams {
  q?: string;
  page?: number;
  limit?: number;
}

/** Matches `customer.schema` create/update */
export interface CreateCustomerBody {
  name: string;
  phone?: string | null;
  email?: string | null;
  doctor_name?: string | null;
  address?: string | null;
}

export type UpdateCustomerBody = Partial<CreateCustomerBody>;

export interface OutstandingData {
  totalOutstanding: number;
  invoices: Array<{
    saleId: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
  }>;
}

/** Matches `recordPaymentSchema` */
export interface RecordCustomerPaymentBody {
  amount: number;
  payment_mode: 'cash' | 'upi' | 'card' | 'bank_transfer';
  note?: string;
}

interface DueReminder {
  customerId: string;
  customerName: string;
  phone: string;
  totalDue: number;
  oldestDueDate: string;
  invoiceCount: number;
}

/** POST /customers/reminders — snake_case matches backend Zod schema */
export interface CreateReminderBody {
  customer_id: string;
  medicine_name: string;
  reminder_date: string;
  notes?: string;
}

/* ─── Helpers ───────────────────────────────────────── */

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

export function normalizeCustomer(raw: Record<string, unknown>): Customer {
  const outstanding =
    raw.outstanding_balance != null
      ? Number(raw.outstanding_balance)
      : raw.outstandingBalance != null
        ? Number(raw.outstandingBalance)
        : 0;

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    phone: raw.phone != null ? String(raw.phone) : '',
    email: raw.email != null ? String(raw.email) : '',
    address: raw.address != null ? String(raw.address) : '',
    doctorName: String(raw.doctor_name ?? raw.doctorName ?? ''),
    outstandingBalance: outstanding,
    lastPurchaseDate:
      raw.last_purchase_date != null
        ? String(raw.last_purchase_date)
        : raw.lastPurchaseDate != null
          ? String(raw.lastPurchaseDate)
          : undefined,
    importanceScore:
      raw.importance_score != null
        ? Number(raw.importance_score)
        : raw.importanceScore != null
          ? Number(raw.importanceScore)
          : undefined,
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
  };
}

function paymentStatusBadge(status: unknown): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'credit') return 'Credit';
  if (s === 'partial') return 'Partial';
  return 'Paid';
}

export function normalizeRecentSale(raw: Record<string, unknown>): RecentSaleSummary {
  const saleDate = String(raw.sale_date ?? raw.saleDate ?? '');
  const ps = raw.payment_status ?? raw.paymentStatus;
  return {
    id: String(raw.id ?? ''),
    invoiceNumber: String(raw.invoice_number ?? raw.invoiceNumber ?? ''),
    saleDate,
    netAmount: Number(raw.net_amount ?? raw.netAmount ?? 0),
    paymentStatus: String(ps ?? ''),
    balanceDue: Number(raw.balance_due ?? raw.balanceDue ?? 0),
    status: paymentStatusBadge(ps),
  };
}

interface OutstandingBackend {
  outstanding_balance: number;
  credit_sales?: Record<string, unknown>[];
}

function normalizeOutstanding(raw: OutstandingBackend): OutstandingData {
  const rows = raw.credit_sales ?? [];
  return {
    totalOutstanding: Number(raw.outstanding_balance ?? 0),
    invoices: rows.map((s) => ({
      saleId: String(s.id ?? ''),
      invoiceNumber: String(s.invoice_number ?? ''),
      amount: Number(s.balance_due ?? s.net_amount ?? 0),
      dueDate: String(s.sale_date ?? ''),
      daysOverdue: 0,
    })),
  };
}

/* ─── API ───────────────────────────────────────────── */

export const customersApi = {
  getCustomers: async (params?: CustomerParams): Promise<PaginatedCustomers> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[]; pagination: ApiPagination }>('/customers', {
      params,
    });
    const { data, pagination } = extractPaginated(res);
    return {
      data: data.map((row) => normalizeCustomer(row as Record<string, unknown>)),
      pagination,
    };
  },

  getCustomer: async (id: string): Promise<CustomerDetail> => {
    const res = await apiClient.get<{ data: Record<string, unknown> }>(`/customers/${id}`);
    const payload = res.data?.data ?? {};

    if (payload.customer && typeof payload.customer === 'object') {
      const rs = payload.recent_sales;
      const recent_sales = Array.isArray(rs)
        ? rs.map((r) => normalizeRecentSale(r as Record<string, unknown>))
        : [];
      return {
        customer: normalizeCustomer(payload.customer as Record<string, unknown>),
        recent_sales,
      };
    }

    const { recent_sales: rsRaw, ...custFields } = payload;
    const recent_sales = Array.isArray(rsRaw)
      ? rsRaw.map((r) => normalizeRecentSale(r as Record<string, unknown>))
      : [];
    return {
      customer: normalizeCustomer(custFields as Record<string, unknown>),
      recent_sales,
    };
  },

  createCustomer: async (body: CreateCustomerBody): Promise<Customer> => {
    const res = await apiClient.post<{ data: Record<string, unknown> }>('/customers', body);
    return normalizeCustomer(extract(res) as Record<string, unknown>);
  },

  updateCustomer: async (id: string, body: UpdateCustomerBody): Promise<Customer> => {
    const res = await apiClient.put<{ data: Record<string, unknown> }>(`/customers/${id}`, body);
    return normalizeCustomer(extract(res) as Record<string, unknown>);
  },

  getOutstanding: async (id: string): Promise<OutstandingData> => {
    const res = await apiClient.get<{ data: OutstandingBackend }>(`/customers/${id}/outstanding`);
    return normalizeOutstanding(extract(res));
  },

  recordPayment: async (id: string, body: RecordCustomerPaymentBody): Promise<Customer> => {
    const res = await apiClient.post<{ data: Record<string, unknown> }>(`/customers/${id}/payment`, body);
    return normalizeCustomer(extract(res) as Record<string, unknown>);
  },

  getDueReminders: async (): Promise<DueReminder[]> => {
    const res = await apiClient.get<{ data: DueReminder[] }>('/customers/reminders/due');
    return extract(res);
  },

  createReminder: async (body: CreateReminderBody): Promise<void> => {
    await apiClient.post('/customers/reminders', body);
  },
} as const;
