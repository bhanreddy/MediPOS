import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '@/api/expenses';
import { useUIStore } from '@/stores/uiStore';

/* ─── Types ─────────────────────────────────────────── */

interface ExpenseParams {
  page?: number;
  category?: string;
  from?: string;
  to?: string;
}

/* ─── Query Hooks ───────────────────────────────────── */

export function useExpenses(params?: ExpenseParams) {
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: () => expensesApi.getExpenses(params),
  });
}

export function useExpenseSummary(from: string, to: string) {
  return useQuery({
    queryKey: ['expense-summary', from, to],
    queryFn: () => expensesApi.getExpenseSummary(from, to),
    enabled: !!from && !!to,
  });
}

/* ─── Mutation Hooks ────────────────────────────────── */

export function useCreateExpense() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: expensesApi.createExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      addToast('Expense recorded', 'success');
    },
    onError: () => {
      addToast('Failed to record expense', 'error');
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: expensesApi.deleteExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      addToast('Expense deleted', 'success');
    },
    onError: () => {
      addToast('Failed to delete expense', 'error');
    },
  });
}
