import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

export const analyticsRouter = Router();

function startDateFromRange(range: number): string {
  const d = new Date();
  d.setDate(d.getDate() - range);
  return d.toISOString();
}

function bucketKey(iso: string, period: string): string {
  const d = new Date(iso);
  if (period === 'weekly') {
    const w = new Date(d);
    w.setDate(d.getDate() - d.getDay());
    return w.toISOString().split('T')[0];
  }
  if (period === 'monthly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return d.toISOString().split('T')[0];
}

analyticsRouter.get('/revenue-trend', requireAuth, async (req, res, next) => {
  try {
    const period = (req.query.period as string) || 'daily';
    const range = Math.min(parseInt((req.query.range as string) || '30', 10), 365);
    const clinicId = req.user!.clinic_id!;

    const { data: sales, error } = await supabaseAdmin
      .from('sales')
      .select('sale_date, net_amount')
      .eq('clinic_id', clinicId)
      .eq('is_return', false)
      .gte('sale_date', startDateFromRange(range));

    if (error) throw error;

    const map = new Map<string, { revenue: number; bills: number }>();
    for (const s of sales || []) {
      const key = bucketKey(s.sale_date, period);
      const cur = map.get(key) || { revenue: 0, bills: 0 };
      cur.revenue += Number(s.net_amount);
      cur.bills += 1;
      map.set(key, cur);
    }

    const data = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => ({
        date,
        revenue: Math.round(m.revenue * 100) / 100,
        bills: m.bills,
        avg_basket: m.bills ? Math.round((m.revenue / m.bills) * 100) / 100 : 0,
      }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/medicine-performance', requireAuth, async (req, res, next) => {
  try {
    const from = (req.query.from as string) || startDateFromRange(30);
    const to = (req.query.to as string) || new Date().toISOString();
    const sort = (req.query.sort as string) || 'revenue';
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
    const clinicId = req.user!.clinic_id!;

    const { data: rows, error } = await supabaseAdmin
      .from('sale_items')
      .select('medicine_id, quantity, total, mrp, medicines!inner(name), sales!inner(sale_date, is_return)')
      .eq('clinic_id', clinicId)
      .eq('sales.is_return', false)
      .gte('sales.sale_date', from)
      .lte('sales.sale_date', to);

    if (error) throw error;

    const agg = new Map<
      string,
      { name: string; qty: number; revenue: number; margin: number }
    >();

    for (const r of rows || []) {
      const id = r.medicine_id;
      const m = (r as any).medicines;
      const cur = agg.get(id) || { name: m?.name || id, qty: 0, revenue: 0, margin: 0 };
      cur.qty += r.quantity;
      cur.revenue += Number(r.total);
      const costGuess = Number(r.mrp) * 0.6 * r.quantity;
      cur.margin += Number(r.total) - costGuess;
      agg.set(id, cur);
    }

    let list = Array.from(agg.entries()).map(([medicine_id, v]) => ({
      medicine_id,
      name: v.name,
      quantity_sold: v.qty,
      revenue: Math.round(v.revenue * 100) / 100,
      margin_pct: v.revenue > 0 ? Math.round((v.margin / v.revenue) * 10000) / 100 : 0,
      sell_through_rate: v.qty,
    }));

    if (sort === 'qty') list.sort((a, b) => b.quantity_sold - a.quantity_sold);
    else if (sort === 'margin') list.sort((a, b) => b.margin_pct - a.margin_pct);
    else list.sort((a, b) => b.revenue - a.revenue);

    res.json({ data: list.slice(0, limit) });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/customer-insights', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const { data: customers, error } = await supabaseAdmin
      .from('customers')
      .select('id, name, importance_score, last_purchase_date')
      .eq('clinic_id', clinicId)
      .eq('is_active', true);

    if (error) throw error;

    const now = new Date();
    const seg = { high_value: 0, regular: 0, at_risk: 0, lost: 0 };
    for (const c of customers || []) {
      const score = Number(c.importance_score) || 0;
      if (score >= 80) seg.high_value += 1;
      if (!c.last_purchase_date) {
        seg.lost += 1;
        continue;
      }
      const days = Math.floor((now.getTime() - new Date(c.last_purchase_date).getTime()) / 86400000);
      if (days <= 30) seg.regular += 1;
      else if (days <= 60) seg.at_risk += 1;
      else seg.lost += 1;
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count: newCust } = await supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('created_at', monthStart.toISOString());

    const { data: sales } = await supabaseAdmin
      .from('sales')
      .select('net_amount, customer_id')
      .eq('clinic_id', clinicId)
      .eq('is_return', false)
      .gte('sale_date', startDateFromRange(30));

    const baskets = (sales || []).filter((s) => s.customer_id);
    const sum = baskets.reduce((a, s) => a + Number(s.net_amount), 0);
    const avg_basket_size = baskets.length ? Math.round((sum / baskets.length) * 100) / 100 : 0;

    const { data: top } = await supabaseAdmin
      .from('customers')
      .select('id, name, total_purchases, importance_score')
      .eq('clinic_id', clinicId)
      .order('total_purchases', { ascending: false })
      .limit(5);

    res.json({
      data: {
        new_customers_this_month: newCust || 0,
        returning_customers_pct: customers?.length
          ? Math.round((seg.regular / Math.max(customers.length, 1)) * 10000) / 100
          : 0,
        avg_basket_size,
        top_customers: top || [],
        customer_segments: seg,
      },
    });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/inventory-health', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const { data: batches } = await supabaseAdmin
      .from('medicine_batches')
      .select('quantity_remaining, purchase_price, medicine_id, expiry_date')
      .eq('clinic_id', clinicId)
      .gt('quantity_remaining', 0);

    let total_inventory_value = 0;
    let expiry_risk_value = 0;
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);
    for (const b of batches || []) {
      const v = b.quantity_remaining * Number(b.purchase_price);
      total_inventory_value += v;
      if (new Date(b.expiry_date) <= soon) expiry_risk_value += v;
    }

    const { data: cogsRows } = await supabaseAdmin
      .from('sale_items')
      .select('quantity, medicine_batches!inner(purchase_price), sales!inner(sale_date, is_return)')
      .eq('clinic_id', clinicId)
      .eq('sales.is_return', false)
      .gte('sales.sale_date', startDateFromRange(30));

    let cogs = 0;
    for (const r of cogsRows || []) {
      cogs += r.quantity * Number((r as any).medicine_batches.purchase_price);
    }

    const avg_inventory_value = total_inventory_value;
    const turnover_ratio = avg_inventory_value > 0 ? Math.round((cogs / avg_inventory_value) * 1000) / 1000 : 0;

    const { data: saleQty } = await supabaseAdmin
      .from('sale_items')
      .select('quantity, sales!inner(sale_date, is_return)')
      .eq('clinic_id', clinicId)
      .eq('sales.is_return', false)
      .gte('sales.sale_date', startDateFromRange(30));

    const soldQty = (saleQty || []).reduce((a, r) => a + r.quantity, 0);
    const avg_daily_sales_qty = soldQty / 30;
    const totalQty = (batches || []).reduce((a, b) => a + b.quantity_remaining, 0);
    const days_of_supply = avg_daily_sales_qty > 0 ? Math.round(totalQty / avg_daily_sales_qty) : 0;

    res.json({
      data: {
        total_inventory_value: Math.round(total_inventory_value * 100) / 100,
        slow_moving_value: 0,
        expiry_risk_value: Math.round(expiry_risk_value * 100) / 100,
        turnover_ratio,
        days_of_supply,
      },
    });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/payment-behaviour', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const { data: sales, error } = await supabaseAdmin
      .from('sales')
      .select('payment_mode, balance_due, sale_date')
      .eq('clinic_id', clinicId)
      .eq('is_return', false)
      .gte('sale_date', startDateFromRange(90));

    if (error) throw error;

    const modes: Record<string, number> = {};
    for (const s of sales || []) {
      modes[s.payment_mode] = (modes[s.payment_mode] || 0) + 1;
    }

    const now = new Date();
    const aging = { d0_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
    for (const s of sales || []) {
      if (Number(s.balance_due) <= 0) continue;
      const days = Math.floor((now.getTime() - new Date(s.sale_date).getTime()) / 86400000);
      if (days <= 7) aging.d0_7 += Number(s.balance_due);
      else if (days <= 30) aging.d8_30 += Number(s.balance_due);
      else if (days <= 60) aging.d31_60 += Number(s.balance_due);
      else aging.d60p += Number(s.balance_due);
    }

    res.json({
      data: {
        payment_mode_split: modes,
        outstanding_aging: aging,
      },
    });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/purchase-intelligence', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const { data: purchases } = await supabaseAdmin
      .from('purchases')
      .select('net_amount, supplier_id, suppliers(name)')
      .eq('clinic_id', clinicId)
      .gte('created_at', startDateFromRange(90));

    const bySup: Record<string, { name: string; value: number }> = {};
    for (const p of purchases || []) {
      const sid = p.supplier_id || 'none';
      const name = (p as any).suppliers?.name || 'Unknown';
      const cur = bySup[sid] || { name, value: 0 };
      cur.value += Number(p.net_amount);
      bySup[sid] = cur;
    }

    const top_suppliers_by_value = Object.values(bySup)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const { data: stock } = await supabaseAdmin
      .from('medicine_stock')
      .select('medicine_id, total_stock')
      .eq('clinic_id', clinicId);

    const { data: soldM } = await supabaseAdmin
      .from('sale_items')
      .select('medicine_id, quantity, sales!inner(sale_date, is_return)')
      .eq('clinic_id', clinicId)
      .eq('sales.is_return', false)
      .gte('sales.sale_date', startDateFromRange(30));

    const soldMap: Record<string, number> = {};
    for (const r of soldM || []) {
      soldMap[r.medicine_id] = (soldMap[r.medicine_id] || 0) + r.quantity;
    }

    const overstock: Array<{ medicine_id: string; stock: number; avg_monthly_sales: number }> = [];
    for (const row of stock || []) {
      const avg = (soldMap[row.medicine_id] || 0);
      if (avg > 0 && Number(row.total_stock) > 3 * avg) {
        overstock.push({
          medicine_id: row.medicine_id,
          stock: Number(row.total_stock),
          avg_monthly_sales: avg,
        });
      }
    }

    res.json({
      data: {
        top_suppliers_by_value,
        avg_lead_time_per_supplier: [],
        purchase_vs_sales_ratio: 0,
        overstock_medicines: overstock.slice(0, 50),
      },
    });
  } catch (err) {
    next(err);
  }
});
