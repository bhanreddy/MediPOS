import { apiClient } from './client';
import type { AxiosResponse } from 'axios';

/* ─── Types ─────────────────────────────────────────── */

interface AccountingSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalPurchases: number;
  netProfit: number;
  cashInHand: number;
  receivables: number;
  payables: number;
  period: { from: string; to: string };
}

/* ─── Helpers ───────────────────────────────────────── */

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

/* ─── API ───────────────────────────────────────────── */

export const accountingApi = {
  getAccountingSummary: async (from: string, to: string): Promise<AccountingSummary> => {
    const res = await apiClient.get<{ data: AccountingSummary }>('/accounting/summary', {
      params: { from, to },
    });
    return extract(res);
  },
} as const;
