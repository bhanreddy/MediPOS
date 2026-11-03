import { apiClient } from './client';

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
  totalReturns: number;
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

/* ─── API — All reads from remote ────────────────────── */

export const reportsApi = {
  getDashboard: async (): Promise<DashboardData> => {
    const res = await apiClient.get('/reports/dashboard');
    const raw = res.data.data ?? res.data;
    return {
      today_revenue: Number(raw.today_revenue ?? 0),
      today_bills: Number(raw.today_bills ?? 0),
      week_revenue: Number(raw.week_revenue ?? 0),
      low_stock_count: Number(raw.low_stock_count ?? 0),
      expiry_count_30d: Number(raw.expiry_count_30d ?? 0),
      outstanding_receivable: Number(raw.outstanding_receivable ?? 0),
      outstanding_payable: Number(raw.outstanding_payable ?? 0),
      shortbook_count: Number(raw.shortbook_count ?? 0),
      daily_chart: raw.daily_chart ?? [],
      recent_activity: (raw.recent_activity ?? raw.recent_sales ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        invoice_number: String(r.invoice_number ?? ''),
        customer_name: String(r.customer_name ?? (r.customers as { name?: string } | undefined)?.name ?? 'Walk-in'),
        net_amount: Number(r.net_amount ?? 0),
        date: String(r.date ?? r.created_at ?? ''),
        payment_mode: String(r.payment_mode ?? 'cash'),
        is_return: Boolean(r.is_return),
      })),
    };
  },

  getProfitLoss: async (from: string, to: string): Promise<ProfitLossData> => {
    const res = await apiClient.get('/reports/profit-loss', { params: { from, to } });
    const raw = res.data.data ?? res.data;
    return {
      totalRevenue: Number(raw.gross_revenue ?? raw.totalRevenue ?? raw.net_revenue ?? 0),
      totalReturns: Number(raw.total_returns ?? raw.totalReturns ?? 0),
      totalCost: Number(raw.cogs ?? raw.totalCost ?? raw.total_cost ?? 0),
      grossProfit: Number(raw.gross_profit ?? raw.grossProfit ?? 0),
      expenses: Number(raw.total_expenses ?? raw.expenses ?? 0),
      netProfit: Number(raw.net_profit ?? raw.netProfit ?? 0),
      period: { from, to },
    };
  },

  getProductWise: async (from: string, to: string): Promise<ProductWiseData[]> => {
    const res = await apiClient.get('/reports/product-wise', { params: { from, to } });
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => ({
      productId: String(r.productId ?? r.product_id ?? r.medicine_id ?? ''),
      name: String(r.name ?? ''),
      quantitySold: Number(r.quantitySold ?? r.quantity_sold ?? r.qty ?? 0),
      totalRevenue: Number(r.totalRevenue ?? r.total_revenue ?? r.revenue ?? 0),
      totalProfit: Number(r.totalProfit ?? r.total_profit ?? 0),
    }));
  },

  getExpiryReport: async (days: number): Promise<ExpiryItem[]> => {
    const res = await apiClient.get('/reports/expiry', { params: { days } });
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => ({
      batchId: String(r.batchId ?? r.batch_id ?? r.id ?? ''),
      medicineName: String(r.medicineName ?? r.medicine_name ?? ''),
      expiryDate: String(r.expiryDate ?? r.expiry_date ?? ''),
      quantity: Number(r.quantity ?? r.quantity_remaining ?? 0),
      mrp: Number(r.mrp ?? 0),
    }));
  },

  getSlowMoving: async (days: number): Promise<SlowMovingItem[]> => {
    const res = await apiClient.get('/reports/slow-moving', { params: { days } });
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => ({
      medicineId: String(r.medicineId ?? r.medicine_id ?? ''),
      name: String(r.name ?? ''),
      lastSoldAt: String(r.lastSoldAt ?? r.last_sold_at ?? r.last_sold ?? ''),
      currentStock: Number(r.currentStock ?? r.current_stock ?? r.stock ?? 0),
    }));
  },

  getGstSales: async (from: string, to: string): Promise<GstSaleItem[]> => {
    const res = await apiClient.get('/reports/gst-sales', { params: { from, to } });
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => {
      const taxable = Number(r.taxable_amount ?? r.taxableAmount ?? 0);
      const cgst = Number(r.cgst ?? 0);
      const sgst = Number(r.sgst ?? 0);
      return {
        invoiceId: String(r.gst_rate ?? r.gstRate ?? ''),
        date: `${r.gst_rate ?? r.gstRate ?? 0}%`,
        customerName: '',
        taxableAmount: taxable,
        cgst,
        sgst,
        igst: Number(r.igst ?? 0),
        total: Number(r.gross_amount ?? r.total ?? taxable + cgst + sgst),
      };
    });
  },

  getScheduleH1: async (from: string, to: string): Promise<ScheduleH1Item[]> => {
    const res = await apiClient.get('/reports/schedule-h1', { params: { from, to } });
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>, idx: number) => ({
      saleId: String(r.saleId ?? r.sale_id ?? r.invoice_number ?? idx),
      date: String(r.date ?? r.sale_date ?? ''),
      medicineName: String(r.medicineName ?? r.medicine_name ?? ''),
      schedule: String(r.schedule ?? 'H1'),
      quantity: Number(r.quantity ?? r.qty ?? 0),
      customerName: String(r.customerName ?? r.customer_name ?? 'Walk-in'),
      prescriptionRef: String(r.prescriptionRef ?? r.prescription_ref ?? r.batch ?? ''),
    }));
  },

  getGstr1: async (month: number, year: number): Promise<Gstr1Data> => {
    const res = await apiClient.get('/reports/gstr1', { params: { month, year } });
    const raw = res.data.data ?? res.data;
    return {
      month,
      year,
      b2b: raw.b2b ?? [],
      b2c: raw.b2c ?? [],
      summary: {
        totalTaxable: Number(raw.summary?.totalTaxable ?? raw.summary?.total_taxable ?? 0),
        totalCgst: Number(raw.summary?.totalCgst ?? raw.summary?.total_cgst ?? 0),
        totalSgst: Number(raw.summary?.totalSgst ?? raw.summary?.total_sgst ?? 0),
        totalIgst: Number(raw.summary?.totalIgst ?? raw.summary?.total_igst ?? 0),
      },
    };
  },
} as const;
