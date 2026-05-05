import { queryAll, queryOne, queryRaw } from '../lib/localQuery';
import { localMutate } from '../lib/localMutate';
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

/* ─── API ───────────────────────────────────────────── */

export const customersApi = {
  getCustomers: async (params?: CustomerParams): Promise<PaginatedCustomers> => {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params?.q) {
      conditions.push('(name LIKE ? OR phone LIKE ?)');
      values.push(`%${params.q}%`, `%${params.q}%`);
    }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const rows = await queryAll<Record<string, unknown>>('customers', where, values);

    rows.sort((a, b) => String(b.created_at ?? b._updated_at ?? '').localeCompare(String(a.created_at ?? a._updated_at ?? '')));

    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const offset = (page - 1) * limit;
    const paged = rows.slice(offset, offset + limit);

    return {
      data: paged.map(normalizeCustomer),
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
    };
  },

  getCustomer: async (id: string): Promise<CustomerDetail> => {
    const row = await queryOne<Record<string, unknown>>('customers', '_local_id=? OR id=?', [id, id]);
    if (!row) throw new Error('Customer not found');

    const custId = row._local_id ?? row.id;
    const salesRows = await queryAll<Record<string, unknown>>('sales', 'customer_id=?', [custId as string]);
    salesRows.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    const recent = salesRows.slice(0, 10);

    return {
      customer: normalizeCustomer(row),
      recent_sales: recent.map(normalizeRecentSale),
    };
  },

  createCustomer: async (body: CreateCustomerBody): Promise<Customer> => {
    const record = await localMutate({ table: 'customers', operation: 'INSERT', data: body });
    return normalizeCustomer(record as Record<string, unknown>);
  },

  updateCustomer: async (id: string, body: UpdateCustomerBody): Promise<Customer> => {
    const existing = await queryOne<Record<string, unknown>>('customers', '_local_id=? OR id=?', [id, id]);
    const record = await localMutate({
      table: 'customers',
      operation: 'UPDATE',
      data: { ...(existing ?? {}), ...body, _local_id: id }
    });
    return normalizeCustomer(record as Record<string, unknown>);
  },

  getOutstanding: async (id: string): Promise<OutstandingData> => {
    const cust = await queryOne<Record<string, unknown>>('customers', '_local_id=? OR id=?', [id, id]);
    const totalOutstanding = Number(cust?.outstanding_balance ?? 0);

    const custId = cust?._local_id ?? cust?.id ?? id;
    const creditSales = await queryAll<Record<string, unknown>>(
      'sales',
      'customer_id=? AND payment_status IN (?,?)',
      [custId as string, 'credit', 'partial']
    );

    return {
      totalOutstanding,
      invoices: creditSales.map(s => ({
        saleId: String(s.id ?? s._local_id ?? ''),
        invoiceNumber: String(s.invoice_number ?? ''),
        amount: Number(s.balance_due ?? s.net_amount ?? 0),
        dueDate: String(s.sale_date ?? s.created_at ?? ''),
        daysOverdue: 0,
      })),
    };
  },

  recordPayment: async (id: string, body: RecordCustomerPaymentBody): Promise<Customer> => {
    const existing = await queryOne<Record<string, unknown>>('customers', '_local_id=? OR id=?', [id, id]);
    const currentBalance = Number(existing?.outstanding_balance ?? 0);
    const record = await localMutate({
      table: 'customers',
      operation: 'UPDATE',
      data: {
        outstanding_balance: currentBalance - body.amount,
        _local_id: id
      }
    });
    return normalizeCustomer(record as Record<string, unknown>);
  },

  getDueReminders: async (): Promise<DueReminder[]> => {
    const rows = await queryRaw<Record<string, any>>(
      `SELECT c._local_id as customerId, c.name as customerName, c.phone,
              c.outstanding_balance as totalDue,
              MIN(s.sale_date) as oldestDueDate,
              COUNT(s._local_id) as invoiceCount
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c._local_id AND s.payment_status IN ('credit','partial') AND s._deleted=0
       WHERE c._deleted=0 AND c.outstanding_balance > 0
       GROUP BY c._local_id`
    );
    return rows.map(r => ({
      customerId: String(r.customerId ?? ''),
      customerName: String(r.customerName ?? ''),
      phone: String(r.phone ?? ''),
      totalDue: Number(r.totalDue ?? 0),
      oldestDueDate: String(r.oldestDueDate ?? ''),
      invoiceCount: Number(r.invoiceCount ?? 0),
    }));
  },

  createReminder: async (body: CreateReminderBody): Promise<void> => {
    await localMutate({ table: 'refill_reminders', operation: 'INSERT', data: body });
  },
} as const;
