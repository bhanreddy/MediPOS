import { queryAll, queryRaw } from '../lib/localQuery';
import { localMutate } from '../lib/localMutate';

export type { ApiPagination } from './client';
import type { ApiPagination } from './client';

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

/* ─── API ───────────────────────────────────────────── */

export const expensesApi = {
  getExpenses: async (params?: ExpenseParams): Promise<PaginatedExpenses> => {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params?.category) { conditions.push('category=?'); values.push(params.category); }
    if (params?.from) { conditions.push('expense_date>=?'); values.push(params.from); }
    if (params?.to) { conditions.push('expense_date<=?'); values.push(params.to); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const rows = await queryAll<Record<string, unknown>>('expenses', where, values);

    // Sort by date descending
    rows.sort((a, b) => String(b.expense_date ?? '').localeCompare(String(a.expense_date ?? '')));

    const page = params?.page ?? 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const paged = rows.slice(offset, offset + limit);

    return {
      data: paged.map(normalizeExpenseRow),
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
    };
  },

  getExpenseSummary: async (from: string, to: string): Promise<ExpenseSummary> => {
    const rows = await queryRaw<{ category: string; total: number; cnt: number }>(
      `SELECT category, SUM(amount) as total, COUNT(*) as cnt
       FROM expenses WHERE _deleted=0 AND expense_date>=? AND expense_date<=?
       GROUP BY category`,
      [from, to]
    );

    const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);

    return {
      totalAmount: grandTotal,
      byCategory: rows.map(r => ({
        category: String(r.category) as ExpenseCategoryDb,
        amount: Number(r.total ?? 0),
        count: Number(r.cnt ?? 0),
      })),
      period: { from, to },
    };
  },

  createExpense: async (body: CreateExpenseBody): Promise<Expense> => {
    const record = await localMutate({ table: 'expenses', operation: 'INSERT', data: body });
    return normalizeExpenseRow(record as Record<string, unknown>);
  },

  deleteExpense: async (id: string): Promise<void> => {
    await localMutate({ table: 'expenses', operation: 'DELETE', data: { _local_id: id } });
  },
} as const;
