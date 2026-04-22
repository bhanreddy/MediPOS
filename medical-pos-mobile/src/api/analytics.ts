import { apiClient } from './client';
import type { AxiosResponse } from 'axios';

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

/* ─── Helpers ───────────────────────────────────────── */

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

/* ─── API ───────────────────────────────────────────── */

export const analyticsApi = {
  getRevenueTrend: async (
    period: string,
    range: string,
  ): Promise<RevenueTrendPoint[]> => {
    const res = await apiClient.get<{ data: RevenueTrendPoint[] }>(
      '/analytics/revenue-trend',
      { params: { period, range } },
    );
    return extract(res);
  },

  getMedicinePerformance: async (
    params?: MedicinePerformanceParams,
  ): Promise<MedicinePerformanceItem[]> => {
    const res = await apiClient.get<{ data: MedicinePerformanceItem[] }>(
      '/analytics/medicine-performance',
      { params },
    );
    return extract(res);
  },

  getCustomerInsights: async (): Promise<CustomerInsight[]> => {
    const res = await apiClient.get<{ data: CustomerInsight[] }>(
      '/analytics/customer-insights',
    );
    return extract(res);
  },

  getInventoryHealth: async (): Promise<InventoryHealthData> => {
    const res = await apiClient.get<{ data: InventoryHealthData }>(
      '/analytics/inventory-health',
    );
    return extract(res);
  },

  getPaymentBehaviour: async (): Promise<PaymentBehaviourData> => {
    const res = await apiClient.get<{ data: PaymentBehaviourData }>(
      '/analytics/payment-behaviour',
    );
    return extract(res);
  },

  getPurchaseIntelligence: async (): Promise<PurchaseIntelligenceData> => {
    const res = await apiClient.get<{ data: PurchaseIntelligenceData }>(
      '/analytics/purchase-intelligence',
    );
    return extract(res);
  },
} as const;
