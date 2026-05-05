import { queryAll, queryRaw, queryCount } from '../lib/localQuery';

/* ─── Types ─────────────────────────────────────────── */

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  bills: number;
  avg_basket: number;
}

interface MedicinePerformanceItem {
  medicineId: string;
  name: string;
  quantitySold: number;
  revenue: number;
  profit: number;
  margin: number;
}

interface MedicinePerformanceParams {
  from?: string;
  to?: string;
  sort?: string;
}

interface CustomerInsight {
  customerId: string;
  name: string;
  totalPurchases: number;
  totalSpent: number;
  averageOrderValue: number;
  lastPurchase: string;
  outstandingBalance: number;
}

interface InventoryHealthData {
  totalProducts: number;
  inStockPct: number;
  lowStockPct: number;
  outOfStockPct: number;
  expiringPct: number;
  stockValueAtCost: number;
  stockValueAtMrp: number;
  deadStockCount: number;
}

interface PaymentBehaviourData {
  onTimePct: number;
  latePct: number;
  averageDaysToPayment: number;
  byMode: Array<{
    mode: string;
    count: number;
    amount: number;
  }>;
}

/** Matches `GET /analytics/purchase-intelligence` (`Medical POS Backend/src/routes/analytics.ts`). */
export interface PurchaseIntelligenceData {
  top_suppliers_by_value: Array<{ name: string; value: number }>;
  avg_lead_time_per_supplier: unknown[];
  purchase_vs_sales_ratio: number;
  overstock_medicines: Array<{
    medicine_id: string;
    stock: number;
    avg_monthly_sales: number;
  }>;
}

/* ─── API ───────────────────────────────────────────── */

export const analyticsApi = {
  getRevenueTrend: async (
    period: string,
    range: string,
  ): Promise<RevenueTrendPoint[]> => {
    const days = range === 'month' ? 30 : range === 'year' ? 365 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    const groupBy = period === 'monthly' ? "strftime('%Y-%m', created_at)" : "DATE(created_at)";

    const rows = await queryRaw<{ dt: string; revenue: number; bills: number }>(
      `SELECT ${groupBy} as dt, SUM(net_amount) as revenue, COUNT(*) as bills
       FROM sales WHERE _deleted=0 AND is_return=0 AND created_at>=?
       GROUP BY dt ORDER BY dt`,
      [sinceStr]
    );

    return rows.map(r => ({
      date: r.dt,
      revenue: Number(r.revenue),
      bills: Number(r.bills),
      avg_basket: Number(r.bills) > 0 ? Number(r.revenue) / Number(r.bills) : 0,
    }));
  },

  getMedicinePerformance: async (
    params?: MedicinePerformanceParams,
  ): Promise<MedicinePerformanceItem[]> => {
    const conditions = ['si._deleted=0', 's._deleted=0', 's.is_return=0'];
    const values: any[] = [];

    if (params?.from) { conditions.push('s.created_at>=?'); values.push(params.from); }
    if (params?.to) { conditions.push('s.created_at<=?'); values.push(params.to); }

    const rows = await queryRaw<Record<string, any>>(
      `SELECT si.medicine_id, m.name, SUM(si.quantity) as qty, SUM(si.total) as revenue
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       LEFT JOIN medicines m ON m._local_id = si.medicine_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY si.medicine_id
       ORDER BY revenue DESC`,
      values
    );

    return rows.map(r => ({
      medicineId: String(r.medicine_id ?? ''),
      name: String(r.name ?? ''),
      quantitySold: Number(r.qty ?? 0),
      revenue: Number(r.revenue ?? 0),
      profit: 0, // Needs COGS calculation, deferred
      margin: 0,
    }));
  },

  getCustomerInsights: async (): Promise<CustomerInsight[]> => {
    const rows = await queryRaw<Record<string, any>>(
      `SELECT c._local_id as cid, c.name, c.outstanding_balance,
              c.last_purchase_date,
              COUNT(s._local_id) as total_purchases,
              COALESCE(SUM(s.net_amount), 0) as total_spent
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c._local_id AND s._deleted=0 AND s.is_return=0
       WHERE c._deleted=0
       GROUP BY c._local_id
       ORDER BY total_spent DESC`
    );

    return rows.map(r => ({
      customerId: String(r.cid ?? ''),
      name: String(r.name ?? ''),
      totalPurchases: Number(r.total_purchases ?? 0),
      totalSpent: Number(r.total_spent ?? 0),
      averageOrderValue: Number(r.total_purchases) > 0 ? Number(r.total_spent) / Number(r.total_purchases) : 0,
      lastPurchase: String(r.last_purchase_date ?? ''),
      outstandingBalance: Number(r.outstanding_balance ?? 0),
    }));
  },

  getInventoryHealth: async (): Promise<InventoryHealthData> => {
    const totalProducts = await queryCount('medicines', 'is_active=1');

    const stockRows = await queryRaw<{ mid: string; threshold: number; total_stock: number; cost_val: number; mrp_val: number }>(
      `SELECT m._local_id as mid, m.low_stock_threshold as threshold,
              COALESCE(SUM(mb.quantity_remaining), 0) as total_stock,
              COALESCE(SUM(mb.quantity_remaining * mb.purchase_price), 0) as cost_val,
              COALESCE(SUM(mb.quantity_remaining * mb.mrp), 0) as mrp_val
       FROM medicines m
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m._local_id AND mb._deleted=0
       WHERE m._deleted=0 AND m.is_active=1
       GROUP BY m._local_id`
    );

    const inStock = stockRows.filter(r => r.total_stock > r.threshold).length;
    const lowStock = stockRows.filter(r => r.total_stock > 0 && r.total_stock <= r.threshold).length;
    const outOfStock = stockRows.filter(r => r.total_stock === 0).length;
    const stockValueAtCost = stockRows.reduce((a, r) => a + r.cost_val, 0);
    const stockValueAtMrp = stockRows.reduce((a, r) => a + r.mrp_val, 0);

    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const expiringRows = await queryRaw<{ cnt: number }>(
      `SELECT COUNT(DISTINCT medicine_id) as cnt FROM medicine_batches
       WHERE _deleted=0 AND quantity_remaining>0 AND expiry_date<=?`,
      [in30.toISOString().split('T')[0]]
    );
    const expiring = Number(expiringRows[0]?.cnt ?? 0);

    const total = totalProducts || 1;

    return {
      totalProducts,
      inStockPct: (inStock / total) * 100,
      lowStockPct: (lowStock / total) * 100,
      outOfStockPct: (outOfStock / total) * 100,
      expiringPct: (expiring / total) * 100,
      stockValueAtCost,
      stockValueAtMrp,
      deadStockCount: outOfStock,
    };
  },

  getPaymentBehaviour: async (): Promise<PaymentBehaviourData> => {
    const rows = await queryRaw<{ mode: string; cnt: number; amt: number }>(
      `SELECT payment_mode as mode, COUNT(*) as cnt, SUM(net_amount) as amt
       FROM sales WHERE _deleted=0 AND is_return=0
       GROUP BY payment_mode`
    );

    const total = rows.reduce((a, r) => a + Number(r.cnt), 0) || 1;
    const paidCount = rows.filter(r => r.mode !== 'credit').reduce((a, r) => a + Number(r.cnt), 0);

    return {
      onTimePct: (paidCount / total) * 100,
      latePct: ((total - paidCount) / total) * 100,
      averageDaysToPayment: 0,
      byMode: rows.map(r => ({
        mode: r.mode,
        count: Number(r.cnt),
        amount: Number(r.amt),
      })),
    };
  },

  getPurchaseIntelligence: async (): Promise<PurchaseIntelligenceData> => {
    const suppRows = await queryRaw<{ name: string; value: number }>(
      `SELECT s.name, SUM(p.net_amount) as value
       FROM purchases p
       JOIN suppliers s ON s._local_id = p.supplier_id
       WHERE p._deleted=0
       GROUP BY p.supplier_id
       ORDER BY value DESC LIMIT 10`
    );

    const totalPurchases = await queryRaw<{ total: number }>(
      `SELECT SUM(net_amount) as total FROM purchases WHERE _deleted=0`
    );
    const totalSales = await queryRaw<{ total: number }>(
      `SELECT SUM(net_amount) as total FROM sales WHERE _deleted=0 AND is_return=0`
    );

    const pTotal = Number(totalPurchases[0]?.total ?? 0);
    const sTotal = Number(totalSales[0]?.total ?? 1);

    return {
      top_suppliers_by_value: suppRows.map(r => ({ name: r.name, value: Number(r.value) })),
      avg_lead_time_per_supplier: [],
      purchase_vs_sales_ratio: pTotal / sTotal,
      overstock_medicines: [],
    };
  },
} as const;
