import { apiClient } from './client';
import type { ApiPagination } from './client';

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

export function normalizeCustomer(raw: Record<string, unknown>): Customer {
  const outstanding =
    raw.outstanding_balance != null
      ? Number(raw.outstanding_balance)
      : raw.outstandingBalance != null
        ? Number(raw.outstandingBalance)
        : 0;

  return {
    id: String(raw.id ?? raw._local_id ?? ''),
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
    createdAt: String(raw.created_at ?? raw.createdAt ?? raw._updated_at ?? ''),
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
    id: String(raw.id ?? raw._local_id ?? ''),
    invoiceNumber: String(raw.invoice_number ?? raw.invoiceNumber ?? ''),
    saleDate,
    netAmount: Number(raw.net_amount ?? raw.netAmount ?? 0),
    paymentStatus: String(ps ?? ''),
    balanceDue: Number(raw.balance_due ?? raw.balanceDue ?? 0),
    status: paymentStatusBadge(ps),
  };
}

/* ─── API — Remote reads, writes disabled on mobile ── */

export const customersApi = {
  getCustomers: async (params?: CustomerParams): Promise<PaginatedCustomers> => {
    const res = await apiClient.get('/customers', { params });
    const raw = res.data;
    return {
      data: (raw.data ?? []).map((r: Record<string, unknown>) => normalizeCustomer(r)),
      pagination: raw.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  },

  getCustomer: async (id: string): Promise<CustomerDetail> => {
    const res = await apiClient.get(`/customers/${id}`);
    const raw = res.data.data ?? res.data;
    return {
      customer: normalizeCustomer(raw.customer ?? raw),
      recent_sales: (raw.recent_sales ?? []).map((s: Record<string, unknown>) => normalizeRecentSale(s)),
    };
  },

  /** DISABLED on mobile */
  createCustomer: async (_body: CreateCustomerBody): Promise<Customer> => {
    throw new Error('Customer creation is disabled on mobile. Use the desktop app.');
  },

  /** DISABLED on mobile */
  updateCustomer: async (_id: string, _body: UpdateCustomerBody): Promise<Customer> => {
    throw new Error('Customer updates are disabled on mobile. Use the desktop app.');
  },

  getOutstanding: async (id: string): Promise<OutstandingData> => {
    const res = await apiClient.get(`/customers/${id}/outstanding`);
    const raw = res.data.data ?? res.data;
    return {
      totalOutstanding: Number(raw.totalOutstanding ?? raw.total_outstanding ?? 0),
      invoices: (raw.invoices ?? []).map((s: Record<string, unknown>) => ({
        saleId: String(s.saleId ?? s.sale_id ?? s.id ?? ''),
        invoiceNumber: String(s.invoiceNumber ?? s.invoice_number ?? ''),
        amount: Number(s.amount ?? s.net_amount ?? 0),
        dueDate: String(s.dueDate ?? s.sale_date ?? ''),
        daysOverdue: Number(s.daysOverdue ?? s.days_overdue ?? 0),
      })),
    };
  },

  /** DISABLED on mobile */
  recordPayment: async (_id: string, _body: RecordCustomerPaymentBody): Promise<Customer> => {
    throw new Error('Customer payments are disabled on mobile. Use the desktop app.');
  },

  getDueReminders: async (): Promise<DueReminder[]> => {
    const res = await apiClient.get('/customers/due-reminders');
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => ({
      customerId: String(r.customerId ?? r.customer_id ?? ''),
      customerName: String(r.customerName ?? r.customer_name ?? ''),
      phone: String(r.phone ?? ''),
      totalDue: Number(r.totalDue ?? r.total_due ?? 0),
      oldestDueDate: String(r.oldestDueDate ?? r.oldest_due_date ?? ''),
      invoiceCount: Number(r.invoiceCount ?? r.invoice_count ?? 0),
    }));
  },

  /** DISABLED on mobile */
  createReminder: async (_body: CreateReminderBody): Promise<void> => {
    throw new Error('Reminders are disabled on mobile. Use the desktop app.');
  },
} as const;
