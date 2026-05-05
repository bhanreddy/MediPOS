import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { queryAll, queryRaw } from '../lib/localQuery';

export const accountingRouter = Router();

// GET /api/accounting/summary
accountingRouter.get('/summary', requireAuth, (req, res, next) => {
  try {
    const { from, to } = req.query;

    const salesConditions = ['_deleted=0'];
    const expConditions = ['_deleted=0'];
    const salesValues: any[] = [];
    const expValues: any[] = [];

    if (from) {
      salesConditions.push('created_at>=?'); salesValues.push(from);
      expConditions.push('expense_date>=?'); expValues.push(from);
    }
    if (to) {
      salesConditions.push('created_at<=?'); salesValues.push(to);
      expConditions.push('expense_date<=?'); expValues.push(to);
    }

    const sales = queryRaw<{ net_amount: number; is_return: number }>(
      `SELECT net_amount, is_return FROM sales WHERE ${salesConditions.join(' AND ')}`,
      salesValues
    );

    let gross_revenue = 0;
    let total_returns = 0;
    sales.forEach(s => {
      if (s.is_return) total_returns += Math.abs(Number(s.net_amount));
      else gross_revenue += Number(s.net_amount);
    });

    const net_revenue = gross_revenue - total_returns;

    // COGS from sale_items joined with medicine_batches
    const cogsRows = queryRaw<{ qty: number; pp: number }>(
      `SELECT si.quantity as qty, mb.purchase_price as pp
       FROM sale_items si
       JOIN medicine_batches mb ON mb._local_id = si.batch_id
       JOIN sales s ON s._local_id = si.sale_id
       WHERE si._deleted=0 AND s._deleted=0${from ? ' AND s.created_at>=?' : ''}${to ? ' AND s.created_at<=?' : ''}`,
      [...(from ? [from] : []), ...(to ? [to] : [])]
    );
    const cogs = cogsRows.reduce((a, r) => a + Number(r.qty) * Number(r.pp), 0);

    const gross_profit = net_revenue - cogs;
    const gross_margin_pct = net_revenue > 0 ? (gross_profit / net_revenue) * 100 : 0;

    const exps = queryRaw<{ amount: number; category: string }>(
      `SELECT amount, category FROM expenses WHERE ${expConditions.join(' AND ')}`,
      expValues
    );

    let total = 0;
    const expMap: Record<string, number> = {};
    exps.forEach(e => {
      expMap[e.category] = (expMap[e.category] || 0) + Number(e.amount);
      total += Number(e.amount);
    });

    const total_expenses = {
      by_category: Object.entries(expMap).map(([category, amount]) => ({ category, amount })),
      total
    };

    const net_profit = gross_profit - total;

    const customers = queryAll('customers');
    const outstanding_receivable = customers.reduce((acc: number, c: any) => acc + Number(c.outstanding_balance ?? 0), 0);

    const suppliers = queryAll('suppliers');
    const outstanding_payable = suppliers.reduce((acc: number, s: any) => acc + Number(s.outstanding_balance ?? 0), 0);

    const net_cash_position = net_profit - outstanding_payable + outstanding_receivable;

    res.json({ data: {
      gross_revenue, total_returns, net_revenue,
      cogs, gross_profit, gross_margin_pct,
      total_expenses, net_profit,
      outstanding_receivable, outstanding_payable,
      net_cash_position
    }});
  } catch (err) {
    next(err);
  }
});

// GET /api/accounting/transactions
accountingRouter.get('/transactions', requireAuth, (req, res, next) => {
  try {
    // Unified ledger — implemented as local union query
    const sales = queryRaw<Record<string, any>>(
      `SELECT _local_id as id, 'sale' as type, invoice_number as ref, net_amount as amount, created_at as date
       FROM sales WHERE _deleted=0 ORDER BY created_at DESC LIMIT 50`
    );
    const expenses = queryRaw<Record<string, any>>(
      `SELECT _local_id as id, 'expense' as type, category as ref, amount, expense_date as date
       FROM expenses WHERE _deleted=0 ORDER BY expense_date DESC LIMIT 50`
    );
    const purchases = queryRaw<Record<string, any>>(
      `SELECT _local_id as id, 'purchase' as type, invoice_number as ref, net_amount as amount, created_at as date
       FROM purchases WHERE _deleted=0 ORDER BY created_at DESC LIMIT 50`
    );

    const all = [...sales, ...expenses, ...purchases];
    all.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

    res.json({ data: all.slice(0, 50) });
  } catch (err) {
    next(err);
  }
});

export default accountingRouter;
