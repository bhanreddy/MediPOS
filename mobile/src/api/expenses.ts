import { apiClient, extractPaginated } from './client';
import type { ApiPagination } from './client';

export type { ApiPagination };

/* ─── Types ─────────────────────────────────────────── */

/** Backend `expense.schema` categories */
export type ExpenseCategoryDb =
  | 'rent'
  | 'salary'
  | 'utilities'
  | 'supplies'
  | 'maintenance'
  | 'misc';

/** POST /expenses — matches `createExpenseSchema` */
export interface CreateExpenseBody {
  category: ExpenseCategoryDb;
  description?: string | null;
  amount: number;
  expense_date: string;
  payment_mode?: 'cash' | 'upi' | 'card' | 'bank_transfer';
}

export interface Expense {
  id: string;
  category: ExpenseCategoryDb;
  description: string;
  amount: number;
  /** ISO date string for display (`expense_date` from API) */
  date: string;
  receiptUrl: string | null;
  paymentMode: string;
  createdAt: string;
}

export interface PaginatedExpenses {
  data: Expense[];
  pagination: ApiPagination;
}

interface ExpenseParams {
  page?: number;
  category?: string;
  from?: string;
  to?: string;
}

export interface ExpenseSummary {
  totalAmount: number;
  byCategory: Array<{
    category: ExpenseCategoryDb;
    amount: number;
    count: number;
  }>;
  period: { from: string; to: string };
}

/* ─── Helpers ───────────────────────────────────────── */

function normalizeExpenseRow(raw: Record<string, unknown>): Expense {
  const description = raw.description != null ? String(raw.description) : '';
  const expense_date = raw.expense_date != null ? String(raw.expense_date) : '';
  return {
    id: String(raw.id ?? raw._local_id ?? ''),
    category: String(raw.category ?? 'misc') as ExpenseCategoryDb,
    description,
    amount: Number(raw.amount ?? 0),
    date: expense_date,
    receiptUrl: raw.receipt_url != null ? String(raw.receipt_url) : null,
    paymentMode: String(raw.payment_mode ?? 'cash'),
    createdAt: String(raw.created_at ?? raw._updated_at ?? ''),
  };
}

/* ─── API — All reads from remote, all writes direct to remote ── */

export const expensesApi = {
  /**
   * Fetch expenses from the remote backend API.
   * No local DB reads — always fresh from server.
   */
  getExpenses: async (params?: ExpenseParams): Promise<PaginatedExpenses> => {
    const res = await apiClient.get('/expenses', { params });
    const raw = res.data;

    return {
      data: (raw.data ?? []).map((r: Record<string, unknown>) => normalizeExpenseRow(r)),
      pagination: raw.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  },

  /**
   * Fetch expense summary from the remote backend API.
   */
  getExpenseSummary: async (from?: string, to?: string): Promise<ExpenseSummary> => {
    const res = await apiClient.get('/expenses/summary', { params: { from, to } });
    const raw = res.data.data ?? res.data;

    return {
      totalAmount: Number(raw.grand_total ?? 0),
      byCategory: (raw.summary ?? []).map((r: Record<string, unknown>) => ({
        category: String(r.category) as ExpenseCategoryDb,
        amount: Number(r.total ?? 0),
        count: Number(r.count ?? 0),
      })),
      period: { from: from ?? '', to: to ?? '' },
    };
  },

  /**
   * Create an expense — direct POST to remote API.
   * No local DB save. No sync queue. Fails loudly if offline.
   */
  createExpense: async (body: CreateExpenseBody): Promise<Expense> => {
    const res = await apiClient.post('/expenses', body);
    return normalizeExpenseRow(res.data.data ?? res.data);
  },

  /**
   * Delete an expense — direct DELETE to remote API.
   * No local DB mutation.
   */
  deleteExpense: async (id: string): Promise<void> => {
    await apiClient.delete(`/expenses/${id}`);
  },
} as const;
