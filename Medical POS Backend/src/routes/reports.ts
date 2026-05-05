import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { queryAll, queryOne, queryRaw, queryCount } from '../lib/localQuery';
import { buildGstr1Payload, SaleRowForGstr1 } from '../services/gstr1Builder';

export const reportsRouter = Router();

// GET /api/reports/dashboard
reportsRouter.get('/dashboard', requireAuth, (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString();

    // Revenue today
    const salesToday = queryRaw<{ net_amount: number }>(
      `SELECT net_amount FROM sales WHERE _deleted=0 AND is_return=0 AND created_at>=?`,
      [today]
    );
    const today_revenue = salesToday.reduce((acc, s) => acc + Number(s.net_amount), 0);
    const today_bills = salesToday.length;

    // Week revenue
    const salesWeek = queryRaw<{ net_amount: number; created_at: string }>(
      `SELECT net_amount, created_at FROM sales WHERE _deleted=0 AND is_return=0 AND created_at>=?`,
      [weekStr]
    );
    const week_revenue = salesWeek.reduce((acc, s) => acc + Number(s.net_amount), 0);

    // Low stock count
    const lowRows = queryRaw<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM (
        SELECT m._local_id, COALESCE(SUM(mb.quantity_remaining), 0) as stock, m.low_stock_threshold
        FROM medicines m
        LEFT JOIN medicine_batches mb ON mb.medicine_id = m._local_id AND mb._deleted=0
        WHERE m._deleted=0 AND m.is_active=1
        GROUP BY m._local_id
        HAVING stock <= m.low_stock_threshold AND stock > 0
      )`
    );
    const low_stock_count = Number(lowRows[0]?.cnt ?? 0);

    // Expiry count (30 days)
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const expiryRows = queryRaw<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM medicine_batches
       WHERE _deleted=0 AND quantity_remaining>0 AND expiry_date<=?`,
      [in30.toISOString().split('T')[0]]
    );
    const expiry_count_30d = Number(expiryRows[0]?.cnt ?? 0);

    // Outstandings
    const customers = queryAll('customers');
    const outstanding_receivable = customers.reduce((acc: number, c: any) => acc + Number(c.outstanding_balance ?? 0), 0);

    const suppliers = queryAll('suppliers');
    const outstanding_payable = suppliers.reduce((acc: number, s: any) => acc + Number(s.outstanding_balance ?? 0), 0);

    // Shortbook
    const shortbook_count = queryCount('shortbook', 'is_ordered=0');

    // Daily chart (last 7 days)
    const dailyMap: Record<string, { revenue: number, bills: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().split('T')[0]] = { revenue: 0, bills: 0 };
    }
    salesWeek.forEach(sale => {
      const date = String(sale.created_at ?? '').split('T')[0];
      if (dailyMap[date]) {
        dailyMap[date].revenue += Number(sale.net_amount);
        dailyMap[date].bills += 1;
      }
    });
    const daily_chart = Object.entries(dailyMap).map(([date, metrics]) => ({ date, ...metrics }));

    res.json({
      data: {
        today_revenue, today_bills, week_revenue,
        low_stock_count, expiry_count_30d,
        outstanding_receivable, outstanding_payable,
        shortbook_count, daily_chart
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/gst-sales
reportsRouter.get('/gst-sales', requireAuth, (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

    const rows = queryRaw<{ gst_rate: number; total: number }>(
      `SELECT si.gst_rate, SUM(si.total) as total
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       WHERE si._deleted=0 AND s._deleted=0 AND s.created_at>=? AND s.created_at<=?
       GROUP BY si.gst_rate`,
      [from, to]
    );

    const data = rows.map(r => {
      const taxable = Number(r.total ?? 0);
      const rate = Number(r.gst_rate ?? 0);
      const gst = (taxable * rate) / 100;
      return { gst_rate: rate, taxable_amount: taxable, cgst: gst / 2, sgst: gst / 2, total_gst: gst, gross_amount: taxable + gst };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/gst-purchases
reportsRouter.get('/gst-purchases', requireAuth, (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

    const rows = queryRaw<{ gst_rate: number; total: number }>(
      `SELECT pi.gst_rate, SUM(pi.total) as total
       FROM purchase_items pi
       JOIN purchases p ON p._local_id = pi.purchase_id
       WHERE pi._deleted=0 AND p._deleted=0 AND p.created_at>=? AND p.created_at<=?
       GROUP BY pi.gst_rate`,
      [from, to]
    );

    const data = rows.map(r => {
      const taxable = Number(r.total ?? 0);
      const rate = Number(r.gst_rate ?? 0);
      const gst = (taxable * rate) / 100;
      return { gst_rate: rate, taxable_amount: taxable, cgst: gst / 2, sgst: gst / 2, total_gst: gst, gross_amount: taxable + gst };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/schedule-h1
reportsRouter.get('/schedule-h1', requireAuth, (req, res, next) => {
  try {
    const { from, to } = req.query;
    const conditions = ['si._deleted=0', 's._deleted=0', 'm.is_schedule_h1=1'];
    const values: any[] = [];

    if (from) { conditions.push('s.created_at>=?'); values.push(from); }
    if (to) { conditions.push('s.created_at<=?'); values.push(to); }

    const rows = queryRaw<Record<string, any>>(
      `SELECT si.quantity, si.total, s.created_at as sale_date, s.invoice_number,
              m.name as medicine_name, c.name as customer_name, mb.batch_number
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       JOIN medicines m ON m._local_id = si.medicine_id
       LEFT JOIN medicine_batches mb ON mb._local_id = si.batch_id
       LEFT JOIN customers c ON c._local_id = s.customer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.created_at`,
      values
    );

    const data = rows.map(r => ({
      date: r.sale_date,
      invoice_number: r.invoice_number,
      customer_name: r.customer_name || 'Walk-in',
      medicine_name: r.medicine_name,
      batch: r.batch_number ?? '',
      qty: r.quantity,
      amount: r.total
    }));

    res.json({ data });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/product-wise
reportsRouter.get('/product-wise', requireAuth, (req, res, next) => {
  try {
    const { from, to } = req.query;
    const conditions = ['si._deleted=0', 's._deleted=0'];
    const values: any[] = [];

    if (from) { conditions.push('s.created_at>=?'); values.push(from); }
    if (to) { conditions.push('s.created_at<=?'); values.push(to); }

    const rows = queryRaw<Record<string, any>>(
      `SELECT si.medicine_id, m.name as medicine_name, SUM(si.quantity) as total_qty_sold, SUM(si.total) as total_revenue
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       LEFT JOIN medicines m ON m._local_id = si.medicine_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY si.medicine_id ORDER BY total_revenue DESC`,
      values
    );

    res.json({ data: rows });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/party-wise
reportsRouter.get('/party-wise', requireAuth, (req, res, next) => {
  try {
    const { type, id } = req.query;
    if (type !== 'customer' && type !== 'supplier') {
      return res.status(400).json({ error: 'type must be customer or supplier' });
    }

    if (type === 'customer') {
      const conditions: string[] = [];
      const values: any[] = [];
      if (id) { conditions.push('customer_id=?'); values.push(id); }
      const where = conditions.length > 0 ? conditions.join(' AND ') : '';
      const data = queryAll('sales', where, values);
      res.json({ data });
    } else {
      const conditions: string[] = [];
      const values: any[] = [];
      if (id) { conditions.push('supplier_id=?'); values.push(id); }
      const where = conditions.length > 0 ? conditions.join(' AND ') : '';
      const data = queryAll('purchases', where, values);
      res.json({ data });
    }
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/profit-loss
reportsRouter.get('/profit-loss', requireAuth, (req, res, next) => {
  try {
    const { from, to } = req.query;

    const salesConds = ['_deleted=0'];
    const expConds = ['_deleted=0'];
    const sValues: any[] = [];
    const eValues: any[] = [];

    if (from) { salesConds.push('created_at>=?'); sValues.push(from); expConds.push('expense_date>=?'); eValues.push(from); }
    if (to) { salesConds.push('created_at<=?'); sValues.push(to); expConds.push('expense_date<=?'); eValues.push(to); }

    const sales = queryRaw<{ net_amount: number; is_return: number }>(
      `SELECT net_amount, is_return FROM sales WHERE ${salesConds.join(' AND ')}`,
      sValues
    );

    let gross_revenue = 0;
    let total_returns = 0;
    sales.forEach(s => {
      if (s.is_return) total_returns += Math.abs(Number(s.net_amount));
      else gross_revenue += Number(s.net_amount);
    });
    const net_revenue = gross_revenue - total_returns;

    // COGS
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

    const exps = queryRaw<{ total: number }>(
      `SELECT SUM(amount) as total FROM expenses WHERE ${expConds.join(' AND ')}`,
      eValues
    );
    const total_expenses = Number(exps[0]?.total ?? 0);

    const net_profit = gross_profit - total_expenses;
    const gross_margin_pct = net_revenue > 0 ? (gross_profit / net_revenue) * 100 : 0;

    res.json({ data: {
      gross_revenue, total_returns, net_revenue, cogs, gross_profit, total_expenses, net_profit, gross_margin_pct
    }});
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/expiry-report
reportsRouter.get('/expiry-report', requireAuth, (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const targetStr = targetDate.toISOString().split('T')[0];

    const data = queryRaw(
      `SELECT mb.*, m.name as medicine_name
       FROM medicine_batches mb
       LEFT JOIN medicines m ON m._local_id = mb.medicine_id
       WHERE mb._deleted=0 AND mb.quantity_remaining>0 AND mb.expiry_date<=?
       ORDER BY mb.expiry_date ASC`,
      [targetStr]
    );

    // Group by severity
    const now = new Date();
    const in30 = new Date(); in30.setDate(now.getDate() + 30);
    const in60 = new Date(); in60.setDate(now.getDate() + 60);

    const grouped = { critical: [] as any[], warning: [] as any[], watch: [] as any[] };
    (data as any[]).forEach(item => {
      const exp = new Date(item.expiry_date);
      if (exp <= in30) grouped.critical.push(item);
      else if (exp <= in60) grouped.warning.push(item);
      else grouped.watch.push(item);
    });

    res.json({ data: grouped });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/slow-moving
reportsRouter.get('/slow-moving', requireAuth, (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 60;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    const fromStr = threshold.toISOString();

    // Get medicines that had zero sales in the period
    const solMap: Record<string, number> = {};
    const salesData = queryRaw<{ medicine_id: string; quantity: number }>(
      `SELECT si.medicine_id, si.quantity
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       WHERE si._deleted=0 AND s._deleted=0 AND s.created_at>=?`,
      [fromStr]
    );
    salesData.forEach(s => { solMap[s.medicine_id] = (solMap[s.medicine_id] || 0) + s.quantity; });

    const medicines = queryRaw<Record<string, any>>(
      `SELECT m._local_id as id, m.name, COALESCE(SUM(mb.quantity_remaining), 0) as current_stock
       FROM medicines m
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m._local_id AND mb._deleted=0
       WHERE m._deleted=0 AND m.is_active=1
       GROUP BY m._local_id`
    );

    const slow = medicines
      .filter(m => (solMap[m.id] || 0) === 0 && Number(m.current_stock) > 0)
      .map(m => ({ id: m.id, name: m.name, sold: 0, current_stock: Number(m.current_stock) }));

    res.json({ data: slow });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/gstr1-export?month=1&year=2025
reportsRouter.get('/gstr1-export', requireAuth, (req, res, next) => {
  try {
    const month = parseInt(req.query.month as string, 10);
    const year = parseInt(req.query.year as string, 10);
    if (!month || month < 1 || month > 12 || !year || year < 2000 || year > 2100) {
      return res.status(400).json({ error: { message: 'Valid month (1-12) and year required' } });
    }

    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();

    const clinic = queryOne('clinics', '1=1') as any;

    const salesRaw = queryRaw<Record<string, any>>(
      `SELECT s._local_id, s.invoice_number, s.created_at as sale_date, s.net_amount, c.gstin as customer_gstin
       FROM sales s
       LEFT JOIN customers c ON c._local_id = s.customer_id
       WHERE s._deleted=0 AND s.is_return=0 AND s.created_at>=? AND s.created_at<=?`,
      [start, end]
    );

    const sales: SaleRowForGstr1[] = salesRaw.map(s => {
      const items = queryRaw<Record<string, any>>(
        `SELECT si.total, si.gst_rate, si.quantity, m.hsn_code, m.name as medicine_name
         FROM sale_items si
         LEFT JOIN medicines m ON m._local_id = si.medicine_id
         WHERE si._deleted=0 AND si.sale_id=?`,
        [s._local_id]
      );

      return {
        invoice_number: s.invoice_number,
        sale_date: s.sale_date,
        net_amount: Number(s.net_amount),
        customer_gstin: s.customer_gstin || null,
        items: items.map(it => ({
          total: Number(it.total),
          gst_rate: Number(it.gst_rate),
          quantity: it.quantity,
          hsn_code: it.hsn_code || null,
          medicine_name: it.medicine_name || '',
        })),
      };
    });

    const payload = buildGstr1Payload(clinic?.gstin || '', month, year, sales);
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
});

export default reportsRouter;
