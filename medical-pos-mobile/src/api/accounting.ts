import { queryRaw } from '../lib/localQuery';

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

/* ─── API ───────────────────────────────────────────── */

export const accountingApi = {
  getAccountingSummary: async (from: string, to: string): Promise<AccountingSummary> => {
    const salesRows = await queryRaw<{ net_amount: number; is_return: number }>(
      `SELECT net_amount, is_return FROM sales WHERE _deleted=0 AND created_at>=? AND created_at<=?`,
      [from, to]
    );
    let totalRevenue = 0;
    let totalReturns = 0;
    salesRows.forEach(s => {
      if (s.is_return) totalReturns += Math.abs(Number(s.net_amount));
      else totalRevenue += Number(s.net_amount);
    });

    const expRows = await queryRaw<{ total: number }>(
      `SELECT SUM(amount) as total FROM expenses WHERE _deleted=0 AND expense_date>=? AND expense_date<=?`,
      [from, to]
    );
    const totalExpenses = Number(expRows[0]?.total ?? 0);

    const purchRows = await queryRaw<{ total: number }>(
      `SELECT SUM(net_amount) as total FROM purchases WHERE _deleted=0 AND created_at>=? AND created_at<=?`,
      [from, to]
    );
    const totalPurchases = Number(purchRows[0]?.total ?? 0);

    const receivableRows = await queryRaw<{ total: number }>(
      `SELECT SUM(outstanding_balance) as total FROM customers WHERE _deleted=0`
    );
    const receivables = Number(receivableRows[0]?.total ?? 0);

    const payableRows = await queryRaw<{ total: number }>(
      `SELECT SUM(outstanding_balance) as total FROM suppliers WHERE _deleted=0`
    );
    const payables = Number(payableRows[0]?.total ?? 0);

    const netRevenue = totalRevenue - totalReturns;
    const netProfit = netRevenue - totalExpenses;

    return {
      totalRevenue: netRevenue,
      totalExpenses,
      totalPurchases,
      netProfit,
      cashInHand: netRevenue - totalExpenses - payables + receivables,
      receivables,
      payables,
      period: { from, to },
    };
  },
} as const;
