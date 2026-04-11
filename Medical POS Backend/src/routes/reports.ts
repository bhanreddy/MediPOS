import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { buildGstr1Payload, SaleRowForGstr1 } from '../services/gstr1Builder';

export const reportsRouter = Router();

// GET /api/reports/dashboard
reportsRouter.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const today = new Date().toISOString().split('T')[0];
    
    // Revenue today
    const { data: salesToday } = await supabaseAdmin.from('sales')
      .select('net_amount')
      .eq('clinic_id', clinicId)
      .gte('sale_date', today);

    const today_revenue = salesToday?.reduce((acc, sale) => acc + Number(sale.net_amount), 0) || 0;
    const today_bills = salesToday?.length || 0;

    // Week revenue
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: salesWeek } = await supabaseAdmin.from('sales')
      .select('net_amount, sale_date')
      .eq('clinic_id', clinicId)
      .gte('sale_date', weekAgo.toISOString());
    
    const week_revenue = salesWeek?.reduce((acc, sale) => acc + Number(sale.net_amount), 0) || 0;

    // Low stock count
    const { count: low_stock_count } = await supabaseAdmin.from('low_stock_alerts').select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId);

    // Expiry count
    const { count: expiry_count_30d } = await supabaseAdmin.from('expiry_alerts').select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('severity', 'critical');

    // Outstandings
    const { data: customers } = await supabaseAdmin.from('customers').select('outstanding_balance').eq('clinic_id', clinicId);
    const outstanding_receivable = customers?.reduce((acc, c) => acc + Number(c.outstanding_balance), 0) || 0;

    const { data: suppliers } = await supabaseAdmin.from('suppliers').select('outstanding_balance').eq('clinic_id', clinicId);
    const outstanding_payable = suppliers?.reduce((acc, s) => acc + Number(s.outstanding_balance), 0) || 0;

    // Shortbook
    const { count: shortbook_count } = await supabaseAdmin.from('shortbook').select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_ordered', false);

    // Daily chart (last 7 days grouped)
    const dailyMap: Record<string, { revenue: number, bills: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().split('T')[0]] = { revenue: 0, bills: 0 };
    }

    salesWeek?.forEach(sale => {
      const date = sale.sale_date.split('T')[0];
      if (dailyMap[date]) {
        dailyMap[date].revenue += Number(sale.net_amount);
        dailyMap[date].bills += 1;
      }
    });

    const daily_chart = Object.entries(dailyMap).map(([date, metrics]) => ({ date, ...metrics }));

    res.json({
      data: {
        today_revenue,
        today_bills,
        week_revenue,
        low_stock_count: low_stock_count || 0,
        expiry_count_30d: expiry_count_30d || 0,
        outstanding_receivable,
        outstanding_payable,
        shortbook_count: shortbook_count || 0,
        daily_chart
      }
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/reports/gst-sales
reportsRouter.get('/gst-sales', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

    const { data } = await supabaseAdmin.from('sale_items')
      .select('total, gst_rate, sales!inner(sale_date)')
      .eq('clinic_id', req.user!.clinic_id!)
      .gte('sales.sale_date', from)
      .lte('sales.sale_date', to);

    const grouped: Record<string, any> = {};
    data?.forEach((item: any) => {
      const rate = item.gst_rate;
      if (!grouped[rate]) grouped[rate] = { taxable_amount: 0, cgst: 0, sgst: 0, total_gst: 0, gross_amount: 0 };
      grouped[rate].taxable_amount += item.total;
      const gst = (item.total * rate) / 100;
      grouped[rate].cgst += gst / 2;
      grouped[rate].sgst += gst / 2;
      grouped[rate].total_gst += gst;
      grouped[rate].gross_amount += (item.total + gst);
    });

    res.json({ data: Object.keys(grouped).map(rate => ({ gst_rate: Number(rate), ...grouped[rate] })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/gst-purchases
reportsRouter.get('/gst-purchases', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

    const { data } = await supabaseAdmin.from('purchase_items')
      .select('total, gst_rate, purchases!inner(invoice_date)')
      .eq('clinic_id', req.user!.clinic_id!)
      .gte('purchases.invoice_date', from)
      .lte('purchases.invoice_date', to);

    const grouped: Record<string, any> = {};
    data?.forEach((item: any) => {
      const rate = item.gst_rate;
      if (!grouped[rate]) grouped[rate] = { taxable_amount: 0, cgst: 0, sgst: 0, total_gst: 0, gross_amount: 0 };
      grouped[rate].taxable_amount += item.total;
      const gst = (item.total * rate) / 100;
      grouped[rate].cgst += gst / 2;
      grouped[rate].sgst += gst / 2;
      grouped[rate].total_gst += gst;
      grouped[rate].gross_amount += (item.total + gst);
    });

    res.json({ data: Object.keys(grouped).map(rate => ({ gst_rate: Number(rate), ...grouped[rate] })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/schedule-h1
reportsRouter.get('/schedule-h1', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    let query = supabaseAdmin.from('sale_items')
      .select(`
        quantity, total, 
        sales!inner(sale_date, invoice_number, customers(name)), 
        medicines!inner(name, is_schedule_h1),
        medicine_batches!inner(batch_number)
      `)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('medicines.is_schedule_h1', true);

    if (from) query = query.gte('sales.sale_date', from);
    if (to) query = query.lte('sales.sale_date', to);

    const { data, error } = await query;
    if (error) throw error;

    const mapped = data.map((item: any) => ({
      date: item.sales.sale_date,
      invoice_number: item.sales.invoice_number,
      customer_name: item.sales.customers?.name || 'Walk-in',
      medicine_name: item.medicines.name,
      batch: item.medicine_batches.batch_number,
      qty: item.quantity,
      amount: item.total
    }));

    res.json({ data: mapped });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/product-wise
reportsRouter.get('/product-wise', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    
    let saleQuery = supabaseAdmin.from('sale_items')
      .select('medicine_id, quantity, total, medicines(name), sales!inner(sale_date)')
      .eq('clinic_id', req.user!.clinic_id!);
    if (from) saleQuery = saleQuery.gte('sales.sale_date', from);
    if (to) saleQuery = saleQuery.lte('sales.sale_date', to);

    const { data: sales, error: saleErr } = await saleQuery;
    if (saleErr) throw saleErr;

    const grouped: Record<string, any> = {};
    sales?.forEach((s: any) => {
      const id = s.medicine_id;
      if (!grouped[id]) grouped[id] = { medicine_name: s.medicines.name, total_qty_sold: 0, total_revenue: 0, total_purchases: 0 };
      grouped[id].total_qty_sold += s.quantity;
      grouped[id].total_revenue += s.total;
    });

    res.json({ data: Object.values(grouped) });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/party-wise
reportsRouter.get('/party-wise', requireAuth, async (req, res, next) => {
  try {
    const { type, id } = req.query;
    if (type !== 'customer' && type !== 'supplier') {
      return res.status(400).json({ error: 'type must be customer or supplier' });
    }

    if (type === 'customer') {
      let query = supabaseAdmin.from('sales').select('id, sale_date, invoice_number, net_amount, payment_mode').eq('clinic_id', req.user!.clinic_id!);
      if (id) query = query.eq('customer_id', id);
      const { data } = await query;
      res.json({ data });
    } else {
      let query = supabaseAdmin.from('purchases').select('id, invoice_date, invoice_number, net_amount').eq('clinic_id', req.user!.clinic_id!);
      if (id) query = query.eq('supplier_id', id);
      const { data } = await query;
      res.json({ data });
    }
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/profit-loss
reportsRouter.get('/profit-loss', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const cid = req.user!.clinic_id!;

    let saleQ = supabaseAdmin.from('sales').select('net_amount, is_return').eq('clinic_id', cid);
    let expQ = supabaseAdmin.from('expenses').select('amount').eq('clinic_id', cid);
    let cogsQ = supabaseAdmin.from('sale_items').select('quantity, medicine_batches!inner(purchase_price), sales!inner(sale_date)').eq('clinic_id', cid);

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

    const [ { data: sales }, { data: exps }, { data: cogsData } ] = await Promise.all([saleQ, expQ, cogsQ]);

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

    const total_expenses = exps?.reduce((a, b) => a + Number(b.amount), 0) || 0;

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
reportsRouter.get('/expiry-report', requireAuth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const { data, error } = await supabaseAdmin.from('expiry_alerts').select('*').eq('clinic_id', req.user!.clinic_id!);
    if (error) throw error;
    
    // Server filter
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const filtered = data.filter(d => new Date(d.expiry_date) <= targetDate);

    const grouped = { critical: [], warning: [], watch: [] } as Record<string, any[]>;
    filtered.forEach(item => {
       if (grouped[item.severity]) grouped[item.severity].push(item);
    });

    res.json({ data: grouped });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/slow-moving
reportsRouter.get('/slow-moving', requireAuth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 60;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    const fromStr = threshold.toISOString().split('T')[0];

    const { data: salesData } = await supabaseAdmin.from('sale_items')
      .select('medicine_id, quantity, sales!inner(sale_date)')
      .eq('clinic_id', req.user!.clinic_id!)
      .gte('sales.sale_date', fromStr);

    const solMap: Record<string, number> = {};
    salesData?.forEach((s: any) => {
       solMap[s.medicine_id] = (solMap[s.medicine_id] || 0) + s.quantity;
    });

    const { data: medicines } = await supabaseAdmin.from('medicines')
      .select('id, name, medicine_stock(total_stock)')
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true);

    const slow = [];
    for (const m of (medicines || [])) {
       const sold = solMap[m.id] || 0;
       if (sold === 0) { // defined as zero or very low sales
           const stock = m.medicine_stock?.[0]?.total_stock || 0;
           slow.push({ id: m.id, name: m.name, sold, current_stock: stock });
       }
    }

    res.json({ data: slow });
  } catch(err) {
    next(err);
  }
});

// GET /api/reports/gstr1-export?month=1&year=2025
reportsRouter.get('/gstr1-export', requireAuth, async (req, res, next) => {
  try {
    const month = parseInt(req.query.month as string, 10);
    const year = parseInt(req.query.year as string, 10);
    if (!month || month < 1 || month > 12 || !year || year < 2000 || year > 2100) {
      return res.status(400).json({ error: { message: 'Valid month (1-12) and year required' } });
    }

    const clinicId = req.user!.clinic_id!;
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const { data: clinic, error: cErr } = await supabaseAdmin
      .from('clinics')
      .select('gstin')
      .eq('id', clinicId)
      .single();
    if (cErr) throw cErr;

    const { data: salesRaw, error } = await supabaseAdmin
      .from('sales')
      .select(
        `invoice_number, sale_date, net_amount,
         customers(gstin),
         sale_items(total, gst_rate, quantity, medicines(hsn_code, name))`
      )
      .eq('clinic_id', clinicId)
      .eq('is_return', false)
      .gte('sale_date', start.toISOString())
      .lte('sale_date', end.toISOString());

    if (error) throw error;

    const sales: SaleRowForGstr1[] = (salesRaw || []).map((s: any) => ({
      invoice_number: s.invoice_number,
      sale_date: s.sale_date,
      net_amount: Number(s.net_amount),
      customer_gstin: s.customers?.gstin || null,
      items: (s.sale_items || []).map((it: any) => ({
        total: Number(it.total),
        gst_rate: Number(it.gst_rate),
        quantity: it.quantity,
        hsn_code: it.medicines?.hsn_code || null,
        medicine_name: it.medicines?.name || '',
      })),
    }));

    const payload = buildGstr1Payload(clinic?.gstin || '', month, year, sales);
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
});

export default reportsRouter;
