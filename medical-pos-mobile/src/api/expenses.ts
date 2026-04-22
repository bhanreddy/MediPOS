import { apiClient, extractPaginated, type ApiPagination } from './client';
import type { AxiosResponse } from 'axios';

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

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

function normalizeExpenseRow(raw: Record<string, unknown>): Expense {
  const description = raw.description != null ? String(raw.description) : '';
  const expense_date = raw.expense_date != null ? String(raw.expense_date) : '';
  return {
    id: String(raw.id ?? ''),
    category: String(raw.category ?? 'misc') as ExpenseCategoryDb,
    description,
    amount: Number(raw.amount ?? 0),
    date: expense_date,
    receiptUrl: raw.receipt_url != null ? String(raw.receipt_url) : null,
    paymentMode: String(raw.payment_mode ?? 'cash'),
    createdAt: String(raw.created_at ?? ''),
  };
}

/* ─── API ───────────────────────────────────────────── */

export const expensesApi = {
  getExpenses: async (params?: ExpenseParams): Promise<PaginatedExpenses> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[]; pagination: ApiPagination }>('/expenses', {
      params,
    });
    const { data, pagination } = extractPaginated(res);
    return { data: data.map((row) => normalizeExpenseRow(row as Record<string, unknown>)), pagination };
  },

  getExpenseSummary: async (from: string, to: string): Promise<ExpenseSummary> => {
    const res = await apiClient.get<{
      data: {
        summary: Array<{ category: string; total: number; count: number }>;
        grand_total: number;
      };
    }>('/expenses/summary', {
      params: { from, to },
    });
    const raw = extract(res);
    return {
      totalAmount: Number(raw.grand_total ?? 0),
      byCategory: (raw.summary ?? []).map((s) => ({
        category: String(s.category) as ExpenseCategoryDb,
        amount: Number(s.total ?? 0),
        count: Number(s.count ?? 0),
      })),
      period: { from, to },
    };
  },

  createExpense: async (body: CreateExpenseBody): Promise<Expense> => {
    const res = await apiClient.post<{ data: Record<string, unknown> }>('/expenses', body);
    return normalizeExpenseRow(extract(res) as Record<string, unknown>);
  },

  deleteExpense: async (id: string): Promise<void> => {
    await apiClient.delete(`/expenses/${id}`);
  },
} as const;
