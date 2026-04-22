import { apiClient } from './client';
import type { AxiosResponse } from 'axios';

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

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

export const reportsApi = {
  getDashboard: async (): Promise<DashboardData> => {
    const res = await apiClient.get<{ data: DashboardData }>('/reports/dashboard');
    return extract(res);
  },

  getProfitLoss: async (from: string, to: string): Promise<ProfitLossData> => {
    const res = await apiClient.get<{ data: ProfitLossData }>('/reports/profit-loss', {
      params: { from, to },
    });
    return extract(res);
  },

  getProductWise: async (from: string, to: string): Promise<ProductWiseData[]> => {
    const res = await apiClient.get<{ data: ProductWiseData[] }>('/reports/product-wise', {
      params: { from, to },
    });
    return extract(res);
  },

  getExpiryReport: async (days: number): Promise<ExpiryItem[]> => {
    const res = await apiClient.get<{ data: ExpiryItem[] }>('/reports/expiry-report', {
      params: { days },
    });
    return extract(res);
  },

  getSlowMoving: async (days: number): Promise<SlowMovingItem[]> => {
    const res = await apiClient.get<{ data: SlowMovingItem[] }>('/reports/slow-moving', {
      params: { days },
    });
    return extract(res);
  },

  getGstSales: async (from: string, to: string): Promise<GstSaleItem[]> => {
    const res = await apiClient.get<{ data: GstSaleItem[] }>('/reports/gst-sales', {
      params: { from, to },
    });
    return extract(res);
  },

  getScheduleH1: async (from: string, to: string): Promise<ScheduleH1Item[]> => {
    const res = await apiClient.get<{ data: ScheduleH1Item[] }>('/reports/schedule-h1', {
      params: { from, to },
    });
    return extract(res);
  },

  getGstr1: async (month: number, year: number): Promise<Gstr1Data> => {
    const res = await apiClient.get<{ data: Gstr1Data }>('/reports/gstr1-export', {
      params: { month, year },
    });
    return extract(res);
  },
} as const;
