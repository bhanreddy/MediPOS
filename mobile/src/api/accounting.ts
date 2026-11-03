import { apiClient } from './client';

/* ─── Types ─────────────────────────────────────────── */

export interface AccountingSummary {
  totalRevenue: number;
  totalReturns: number;
  netRevenue: number;
  totalExpenses: number;
  totalPurchases: number;
  grossProfit: number;
  grossMarginPct: number;
  netProfit: number;
  cashInHand: number;
  receivables: number;
  payables: number;
  period: { from: string; to: string };
}

function mapAccountingSummary(raw: Record<string, unknown>, from: string, to: string): AccountingSummary {
  const grossRevenue = Number(raw.gross_revenue ?? raw.totalRevenue ?? 0);
  const totalReturns = Number(raw.total_returns ?? raw.totalReturns ?? 0);
  const netRevenue = Number(raw.net_revenue ?? raw.netRevenue ?? grossRevenue - totalReturns);
  const cogs = Number(raw.cogs ?? raw.totalPurchases ?? raw.total_purchases ?? 0);
  const grossProfit = Number(raw.gross_profit ?? raw.grossProfit ?? netRevenue - cogs);
  const totalExpenses = Number(
    typeof raw.total_expenses === 'object' && raw.total_expenses !== null
      ? (raw.total_expenses as { total?: number }).total
      : raw.total_expenses ?? raw.totalExpenses ?? 0,
  );

  return {
    totalRevenue: grossRevenue,
    totalReturns,
    netRevenue,
    totalExpenses,
    totalPurchases: cogs,
    grossProfit,
    grossMarginPct: Number(raw.gross_margin_pct ?? raw.grossMarginPct ?? (netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0)),
    netProfit: Number(raw.net_profit ?? raw.netProfit ?? grossProfit - totalExpenses),
    cashInHand: Number(raw.net_cash_position ?? raw.cashInHand ?? raw.cash_in_hand ?? 0),
    receivables: Number(raw.outstanding_receivable ?? raw.receivables ?? 0),
    payables: Number(raw.outstanding_payable ?? raw.payables ?? 0),
    period: { from, to },
  };
}

/* ─── API — Remote reads only ────────────────────────── */

export const accountingApi = {
  getAccountingSummary: async (from: string, to: string): Promise<AccountingSummary> => {
    const res = await apiClient.get('/reports/accounting', { params: { from, to } });
    const raw = (res.data?.data ?? res.data ?? {}) as Record<string, unknown>;
    return mapAccountingSummary(raw, from, to);
  },
} as const;
