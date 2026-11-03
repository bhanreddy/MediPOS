import { apiClient } from './client';

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

interface CustomerInsightsData {
  newCustomersThisMonth: number;
  returningCustomersPct: number;
  avgBasketSize: number;
  topCustomers: Array<{
    customerId: string;
    name: string;
    totalPurchases: number;
    totalSpent: number;
    importanceScore: number;
  }>;
  segments: {
    highValue: number;
    regular: number;
    atRisk: number;
    lost: number;
  };
}

interface InventoryHealthData {
  totalInventoryValue: number;
  expiryRiskValue: number;
  turnoverRatio: number;
  daysOfSupply: number;
  slowMovingValue: number;
}

interface PaymentBehaviourData {
  byMode: Array<{
    mode: string;
    count: number;
    amount: number;
  }>;
  outstandingAging: {
    d0_7: number;
    d8_30: number;
    d31_60: number;
    d60p: number;
  };
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

/* ─── API — All reads from remote ────────────────────── */

export const analyticsApi = {
  getRevenueTrend: async (
    period: string,
    range: string,
  ): Promise<RevenueTrendPoint[]> => {
    const res = await apiClient.get('/analytics/revenue-trend', { params: { period, range } });
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => ({
      date: String(r.date ?? r.dt ?? ''),
      revenue: Number(r.revenue ?? 0),
      bills: Number(r.bills ?? 0),
      avg_basket: Number(r.avg_basket ?? (Number(r.bills) > 0 ? Number(r.revenue) / Number(r.bills) : 0)),
    }));
  },

  getMedicinePerformance: async (
    params?: MedicinePerformanceParams,
  ): Promise<MedicinePerformanceItem[]> => {
    const res = await apiClient.get('/analytics/medicine-performance', { params });
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => ({
      medicineId: String(r.medicineId ?? r.medicine_id ?? ''),
      name: String(r.name ?? ''),
      quantitySold: Number(r.quantitySold ?? r.quantity_sold ?? r.qty ?? 0),
      revenue: Number(r.revenue ?? 0),
      profit: Number(r.profit ?? 0),
      margin: Number(r.margin ?? 0),
    }));
  },

  getCustomerInsights: async (): Promise<CustomerInsightsData> => {
    const res = await apiClient.get('/analytics/customer-insights');
    const raw = res.data.data ?? res.data;
    const seg = raw.customer_segments ?? raw.segments ?? {};
    return {
      newCustomersThisMonth: Number(raw.new_customers_this_month ?? raw.newCustomersThisMonth ?? 0),
      returningCustomersPct: Number(raw.returning_customers_pct ?? raw.returningCustomersPct ?? 0),
      avgBasketSize: Number(raw.avg_basket_size ?? raw.avgBasketSize ?? 0),
      topCustomers: (raw.top_customers ?? raw.topCustomers ?? []).map((r: Record<string, any>) => ({
        customerId: String(r.id ?? r.customerId ?? r.customer_id ?? ''),
        name: String(r.name ?? ''),
        totalPurchases: Number(r.total_purchases ?? r.totalPurchases ?? 0),
        totalSpent: Number(r.total_spent ?? r.totalSpent ?? r.total_purchases ?? 0),
        importanceScore: Number(r.importance_score ?? r.importanceScore ?? 0),
      })),
      segments: {
        highValue: Number(seg.high_value ?? seg.highValue ?? 0),
        regular: Number(seg.regular ?? 0),
        atRisk: Number(seg.at_risk ?? seg.atRisk ?? 0),
        lost: Number(seg.lost ?? 0),
      },
    };
  },

  getInventoryHealth: async (): Promise<InventoryHealthData> => {
    const res = await apiClient.get('/analytics/inventory-health');
    const raw = res.data.data ?? res.data;
    return {
      totalInventoryValue: Number(raw.total_inventory_value ?? raw.totalInventoryValue ?? 0),
      expiryRiskValue: Number(raw.expiry_risk_value ?? raw.expiryRiskValue ?? 0),
      turnoverRatio: Number(raw.turnover_ratio ?? raw.turnoverRatio ?? 0),
      daysOfSupply: Number(raw.days_of_supply ?? raw.daysOfSupply ?? 0),
      slowMovingValue: Number(raw.slow_moving_value ?? raw.slowMovingValue ?? 0),
    };
  },

  getPaymentBehaviour: async (): Promise<PaymentBehaviourData> => {
    const res = await apiClient.get('/analytics/payment-behaviour');
    const raw = res.data.data ?? res.data;
    const split = raw.payment_mode_split ?? raw.byMode ?? raw.by_mode ?? {};
    const aging = raw.outstanding_aging ?? raw.outstandingAging ?? {};

    const byMode = Array.isArray(split)
      ? split.map((r: Record<string, any>) => ({
          mode: String(r.mode ?? ''),
          count: Number(r.count ?? 0),
          amount: Number(r.amount ?? 0),
        }))
      : Object.entries(split).map(([mode, val]) => {
          if (typeof val === 'number') {
            return { mode, count: val, amount: 0 };
          }
          const obj = val as Record<string, number>;
          return {
            mode,
            count: Number(obj.count ?? 0),
            amount: Number(obj.amount ?? 0),
          };
        });

    return {
      byMode,
      outstandingAging: {
        d0_7: Number(aging.d0_7 ?? 0),
        d8_30: Number(aging.d8_30 ?? 0),
        d31_60: Number(aging.d31_60 ?? 0),
        d60p: Number(aging.d60p ?? 0),
      },
    };
  },

  getPurchaseIntelligence: async (): Promise<PurchaseIntelligenceData> => {
    const res = await apiClient.get('/analytics/purchase-intelligence');
    const raw = res.data.data ?? res.data;
    return {
      top_suppliers_by_value: (raw.top_suppliers_by_value ?? []).map((r: Record<string, any>) => ({
        name: String(r.name ?? ''),
        value: Number(r.value ?? 0),
      })),
      avg_lead_time_per_supplier: raw.avg_lead_time_per_supplier ?? [],
      purchase_vs_sales_ratio: Number(raw.purchase_vs_sales_ratio ?? 0),
      overstock_medicines: raw.overstock_medicines ?? [],
    };
  },
} as const;
