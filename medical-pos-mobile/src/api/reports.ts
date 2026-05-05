import { queryAll, queryRaw, queryCount } from '../lib/localQuery';

/* ─── Response Types ────────────────────────────────── */

export interface DashboardData {
  today_revenue: number;
  today_bills: number;
  week_revenue: number;
  low_stock_count: number;
  expiry_count_30d: number;
  outstanding_receivable: number;
  outstanding_payable: number;
  shortbook_count: number;
  daily_chart: Array<{
    date: string;
    revenue: number;
    bills: number;
  }>;
  recent_activity: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    net_amount: number;
    date: string;
    payment_mode: string;
    is_return: boolean;
  }>;
}

interface ProfitLossData {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  period: { from: string; to: string };
}

interface ProductWiseData {
  productId: string;
  name: string;
  quantitySold: number;
  totalRevenue: number;
  totalProfit: number;
}

interface ExpiryItem {
  batchId: string;
  medicineName: string;
  expiryDate: string;
  quantity: number;
  mrp: number;
}

interface SlowMovingItem {
  medicineId: string;
  name: string;
  lastSoldAt: string;
  currentStock: number;
}

interface GstSaleItem {
  invoiceId: string;
  date: string;
  customerName: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

interface ScheduleH1Item {
  saleId: string;
  date: string;
  medicineName: string;
  schedule: string;
  quantity: number;
  customerName: string;
  prescriptionRef: string;
}

interface Gstr1Data {
  month: number;
  year: number;
  b2b: unknown[];
  b2c: unknown[];
  summary: {
    totalTaxable: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
  };
}

/* ─── API ───────────────────────────────────────────── */

export const reportsApi = {
  getDashboard: async (): Promise<DashboardData> => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString();

    // Today's revenue
    const todayRows = await queryRaw<{ net_amount: number }>(
      `SELECT net_amount FROM sales WHERE _deleted=0 AND is_return=0 AND created_at>=?`,
      [today]
    );
    const today_revenue = todayRows.reduce((a, r) => a + Number(r.net_amount), 0);
    const today_bills = todayRows.length;

    // Week revenue
    const weekRows = await queryRaw<{ net_amount: number; created_at: string }>(
      `SELECT net_amount, created_at FROM sales WHERE _deleted=0 AND is_return=0 AND created_at>=?`,
      [weekStr]
    );
    const week_revenue = weekRows.reduce((a, r) => a + Number(r.net_amount), 0);

    // Low stock
    const lowRows = await queryRaw<{ cnt: number }>(
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

    // Expiry in 30 days
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const expiryRows = await queryRaw<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM medicine_batches
       WHERE _deleted=0 AND quantity_remaining>0 AND expiry_date<=?`,
      [in30.toISOString().split('T')[0]]
    );
    const expiry_count_30d = Number(expiryRows[0]?.cnt ?? 0);

    // Outstandings
    const recRows = await queryRaw<{ total: number }>(
      `SELECT SUM(outstanding_balance) as total FROM customers WHERE _deleted=0`
    );
    const outstanding_receivable = Number(recRows[0]?.total ?? 0);

    const payRows = await queryRaw<{ total: number }>(
      `SELECT SUM(outstanding_balance) as total FROM suppliers WHERE _deleted=0`
    );
    const outstanding_payable = Number(payRows[0]?.total ?? 0);

    // Shortbook
    const shortbook_count = await queryCount('shortbook', 'is_ordered=0');

    // Daily chart
    const dailyMap: Record<string, { revenue: number; bills: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().split('T')[0]] = { revenue: 0, bills: 0 };
    }
    weekRows.forEach(r => {
      const date = String(r.created_at ?? '').split('T')[0];
      if (dailyMap[date]) {
        dailyMap[date].revenue += Number(r.net_amount);
        dailyMap[date].bills += 1;
      }
    });
    const daily_chart = Object.entries(dailyMap).map(([date, m]) => ({ date, ...m }));

    return {
      today_revenue,
      today_bills,
      week_revenue,
      low_stock_count,
      expiry_count_30d,
      outstanding_receivable,
      outstanding_payable,
      shortbook_count,
      daily_chart,
      recent_activity: [],
    };
  },

  getProfitLoss: async (from: string, to: string): Promise<ProfitLossData> => {
    const salesRows = await queryRaw<{ net_amount: number; is_return: number }>(
      `SELECT net_amount, is_return FROM sales WHERE _deleted=0 AND created_at>=? AND created_at<=?`,
      [from, to]
    );
    let gross = 0; let returns = 0;
    salesRows.forEach(s => { if (s.is_return) returns += Math.abs(Number(s.net_amount)); else gross += Number(s.net_amount); });
    const totalRevenue = gross - returns;

    const expRows = await queryRaw<{ total: number }>(
      `SELECT SUM(amount) as total FROM expenses WHERE _deleted=0 AND expense_date>=? AND expense_date<=?`,
      [from, to]
    );
    const expenses = Number(expRows[0]?.total ?? 0);

    return {
      totalRevenue,
      totalCost: 0, // COGS deferred to sync phase
      grossProfit: totalRevenue,
      expenses,
      netProfit: totalRevenue - expenses,
      period: { from, to },
    };
  },

  getProductWise: async (from: string, to: string): Promise<ProductWiseData[]> => {
    const rows = await queryRaw<Record<string, any>>(
      `SELECT si.medicine_id, m.name, SUM(si.quantity) as qty, SUM(si.total) as revenue
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       LEFT JOIN medicines m ON m._local_id = si.medicine_id
       WHERE si._deleted=0 AND s._deleted=0 AND s.is_return=0 AND s.created_at>=? AND s.created_at<=?
       GROUP BY si.medicine_id ORDER BY revenue DESC`,
      [from, to]
    );
    return rows.map(r => ({
      productId: String(r.medicine_id ?? ''),
      name: String(r.name ?? ''),
      quantitySold: Number(r.qty ?? 0),
      totalRevenue: Number(r.revenue ?? 0),
      totalProfit: 0,
    }));
  },

  getExpiryReport: async (days: number): Promise<ExpiryItem[]> => {
    const target = new Date();
    target.setDate(target.getDate() + days);
    const rows = await queryRaw<Record<string, any>>(
      `SELECT mb.*, m.name as medicine_name
       FROM medicine_batches mb
       LEFT JOIN medicines m ON m._local_id = mb.medicine_id
       WHERE mb._deleted=0 AND mb.quantity_remaining>0 AND mb.expiry_date<=?
       ORDER BY mb.expiry_date ASC`,
      [target.toISOString().split('T')[0]]
    );
    return rows.map(r => ({
      batchId: String(r._local_id ?? r.id ?? ''),
      medicineName: String(r.medicine_name ?? ''),
      expiryDate: String(r.expiry_date ?? ''),
      quantity: Number(r.quantity_remaining ?? 0),
      mrp: Number(r.mrp ?? 0),
    }));
  },

  getSlowMoving: async (days: number): Promise<SlowMovingItem[]> => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    const fromStr = threshold.toISOString();

    const rows = await queryRaw<Record<string, any>>(
      `SELECT m._local_id as mid, m.name,
              COALESCE(SUM(mb.quantity_remaining), 0) as stock,
              COALESCE((SELECT MAX(s.created_at) FROM sale_items si JOIN sales s ON s._local_id=si.sale_id WHERE si.medicine_id=m._local_id AND s._deleted=0), '') as last_sold
       FROM medicines m
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m._local_id AND mb._deleted=0
       WHERE m._deleted=0 AND m.is_active=1
       GROUP BY m._local_id
       HAVING stock > 0 AND (last_sold = '' OR last_sold < ?)`
      , [fromStr]
    );

    return rows.map(r => ({
      medicineId: String(r.mid ?? ''),
      name: String(r.name ?? ''),
      lastSoldAt: String(r.last_sold ?? ''),
      currentStock: Number(r.stock ?? 0),
    }));
  },

  getGstSales: async (from: string, to: string): Promise<GstSaleItem[]> => {
    const rows = await queryRaw<Record<string, any>>(
      `SELECT si.gst_rate, SUM(si.total) as taxable
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       WHERE si._deleted=0 AND s._deleted=0 AND s.created_at>=? AND s.created_at<=?
       GROUP BY si.gst_rate`,
      [from, to]
    );

    return rows.map(r => {
      const taxable = Number(r.taxable ?? 0);
      const rate = Number(r.gst_rate ?? 0);
      const gst = (taxable * rate) / 100;
      return {
        invoiceId: '',
        date: '',
        customerName: '',
        taxableAmount: taxable,
        cgst: gst / 2,
        sgst: gst / 2,
        igst: 0,
        total: taxable + gst,
      };
    });
  },

  getScheduleH1: async (from: string, to: string): Promise<ScheduleH1Item[]> => {
    const rows = await queryRaw<Record<string, any>>(
      `SELECT si.quantity, si.total, s.created_at as sale_date, s.invoice_number,
              m.name as medicine_name, c.name as customer_name
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       JOIN medicines m ON m._local_id = si.medicine_id AND m.is_schedule_h1=1
       LEFT JOIN customers c ON c._local_id = s.customer_id
       WHERE si._deleted=0 AND s._deleted=0 AND s.created_at>=? AND s.created_at<=?
       ORDER BY s.created_at`,
      [from, to]
    );

    return rows.map(r => ({
      saleId: '',
      date: String(r.sale_date ?? ''),
      medicineName: String(r.medicine_name ?? ''),
      schedule: 'H1',
      quantity: Number(r.quantity ?? 0),
      customerName: String(r.customer_name ?? 'Walk-in'),
      prescriptionRef: '',
    }));
  },

  getGstr1: async (month: number, year: number): Promise<Gstr1Data> => {
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59)).toISOString();

    const rows = await queryRaw<{ gst_rate: number; taxable: number }>(
      `SELECT si.gst_rate, SUM(si.total) as taxable
       FROM sale_items si
       JOIN sales s ON s._local_id = si.sale_id
       WHERE si._deleted=0 AND s._deleted=0 AND s.is_return=0 AND s.created_at>=? AND s.created_at<=?
       GROUP BY si.gst_rate`,
      [start, end]
    );

    let totalTaxable = 0, totalCgst = 0, totalSgst = 0;
    rows.forEach(r => {
      const tax = Number(r.taxable ?? 0);
      const gst = (tax * Number(r.gst_rate ?? 0)) / 100;
      totalTaxable += tax;
      totalCgst += gst / 2;
      totalSgst += gst / 2;
    });

    return {
      month, year,
      b2b: [], b2c: [],
      summary: { totalTaxable, totalCgst, totalSgst, totalIgst: 0 },
    };
  },
} as const;
