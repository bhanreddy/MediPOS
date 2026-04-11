import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

export const accountingRouter = Router();

// GET /api/accounting/summary
accountingRouter.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const cid = req.user!.clinic_id!;

    let saleQ = supabaseAdmin.from('sales').select('net_amount, is_return').eq('clinic_id', cid);
    let expQ = supabaseAdmin.from('expenses').select('amount, category').eq('clinic_id', cid);
    let cogsQ = supabaseAdmin.from('sale_items').select('quantity, medicine_batches!inner(purchase_price), sales!inner(sale_date)').eq('clinic_id', cid);
    let custQ = supabaseAdmin.from('customers').select('outstanding_balance').eq('clinic_id', cid);
    let suppQ = supabaseAdmin.from('suppliers').select('outstanding_balance').eq('clinic_id', cid);

    if (from) {
      saleQ = saleQ.gte('sale_date', from);
      expQ = expQ.gte('expense_date', from);
      cogsQ = cogsQ.gte('sales.sale_date', from);
    }
    if (to) {
      saleQ = saleQ.lte('sale_date', to);
      expQ = expQ.lte('expense_date', to);
      cogsQ = cogsQ.lte('sales.sale_date', to);
    }

    const [ { data: sales }, { data: exps }, { data: cogsData }, { data: customers }, { data: suppliers } ] = await Promise.all([saleQ, expQ, cogsQ, custQ, suppQ]);

    let gross_revenue = 0;
    let total_returns = 0;
    sales?.forEach(s => {
      if (s.is_return) total_returns += Math.abs(Number(s.net_amount));
      else gross_revenue += Number(s.net_amount);
    });

    const net_revenue = gross_revenue - total_returns;

    let cogs = 0;
    cogsData?.forEach((c: any) => {
       cogs += c.quantity * c.medicine_batches.purchase_price;
    });

    const gross_profit = net_revenue - cogs;
    const gross_margin_pct = net_revenue > 0 ? (gross_profit / net_revenue) * 100 : 0;

    let total = 0;
    const expMap: Record<string, number> = {};
    exps?.forEach(e => {
       expMap[e.category] = (expMap[e.category] || 0) + Number(e.amount);
       total += Number(e.amount);
    });

    const total_expenses = {
      by_category: Object.entries(expMap).map(([category, amount]) => ({ category, amount })),
      total
    };

    const net_profit = gross_profit - total;

    const outstanding_receivable = customers?.reduce((acc, c) => acc + Number(c.outstanding_balance), 0) || 0;
    const outstanding_payable = suppliers?.reduce((acc, s) => acc + Number(s.outstanding_balance), 0) || 0;

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
accountingRouter.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const { from, to, type } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cid = req.user!.clinic_id!;

    // A unified ledger requires a SQL view or complex union. Supabase doesn't natively union over REST effortlessly.
    // For scaffolding, we will simulate the union by querying individual tables and paginating on sorted combined array.
    
    // In actual production, create a view 'unified_ledger' and REST over it.

    res.status(501).json({ error: "Unified ledger view requires a SQL VIEW 'transactions' across sales, expenses, and purchases. Implement DB viewpoint via Supabase dashboard." });
  } catch (err) {
    next(err);
  }
});

export default accountingRouter;
