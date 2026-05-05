import { useQuery } from '@tanstack/react-query';
import { db } from '../db/index';
import { METRICS_CONFIG } from '../config/appContent';
import api from '../lib/api';
import { InventoryAlertService } from '../services/inventoryAlertService';

function startEndLocalDay(d: Date): { start: string; end: string } {
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    return {
        start: new Date(y, m, day, 0, 0, 0, 0).toISOString(),
        end: new Date(y, m, day, 23, 59, 59, 999).toISOString(),
    };
}

/**
 * Clinic dashboard KPIs from IndexedDB (same source as WebPos / Inventory).
 * The API `/reports/dashboard` reads server SQLite, which is empty when sales only exist locally.
 */
export async function buildClinicDashboardFromDexie(): Promise<Record<string, unknown>> {
    const now = new Date();
    const { start: startOfDay, end: endOfDay } = startEndLocalDay(now);

    const todaySales = await db.sales
        .where('created_at')
        .between(startOfDay, endOfDay, true, true)
        .filter(s => s.status === 'COMPLETED')
        .toArray();
    const today_revenue = todaySales.reduce((sum, s) => sum + Number(s.final_amount ?? 0), 0);
    const today_bills = todaySales.length;

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartIso = weekStart.toISOString();

    const weekSales = await db.sales
        .where('created_at')
        .aboveOrEqual(weekStartIso)
        .filter(s => s.status === 'COMPLETED')
        .toArray();
    const week_revenue = weekSales.reduce((sum, s) => sum + Number(s.final_amount ?? 0), 0);

    /** Same rules as bell Alerts + Inventory “focus” filters (radar rows). */
    const { lowStock: low_stock_count, expiry: expiry_count_30d } = await InventoryAlertService.getCounts();

    const customers = await db.customers.toArray();
    const outstanding_receivable = customers.reduce(
        (acc, c) => acc + Number(c.credit_balance ?? 0),
        0,
    );
    const outstanding_payable = 0;

    const dailyMap: Record<string, { revenue: number; bills: number }> = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyMap[key] = { revenue: 0, bills: 0 };
    }

    for (const sale of weekSales) {
        const date = String(sale.created_at ?? '').split('T')[0];
        if (dailyMap[date]) {
            dailyMap[date].revenue += Number(sale.final_amount ?? 0);
            dailyMap[date].bills += 1;
        }
    }

    const daily_chart = Object.entries(dailyMap).map(([date, metrics]) => ({
        date,
        revenue: metrics.revenue,
        bills: metrics.bills,
    }));

    const recentCandidates = await db.sales.orderBy('created_at').reverse().limit(25).toArray();
    const recentRaw = recentCandidates.filter(s => s.status === 'COMPLETED').slice(0, 10);
    const recent_sales = await Promise.all(
        recentRaw.map(async sale => {
            let name = 'Walk-in';
            if (sale.customer_id) {
                const c = await db.customers.get(sale.customer_id);
                if (c?.name) name = c.name;
            }
            return {
                id: sale.id,
                invoice_number: sale.invoice_number,
                net_amount: sale.final_amount,
                customers: { name },
            };
        }),
    );

    return {
        today_revenue,
        today_bills,
        week_revenue,
        low_stock_count,
        expiry_count_30d,
        outstanding_receivable,
        outstanding_payable,
        shortbook_count: 0,
        daily_chart,
        recent_sales,
        alerts: {
            low_stock: low_stock_count,
            expiring: expiry_count_30d,
            shortbook: 0,
        },
    };
}

export function useClinicDashboardData() {
    return useQuery({
        queryKey: ['clinic-dashboard', 'dexie'],
        queryFn: async () => {
            const local = await buildClinicDashboardFromDexie();
            try {
                const { data } = await api.get<{ data?: Record<string, unknown> }>('/reports/dashboard');
                const apiPayload = (data as { data?: Record<string, unknown> })?.data ?? data;
                const shortbook = Number(
                    (apiPayload as { shortbook_count?: number })?.shortbook_count ?? 0,
                );
                return {
                    ...local,
                    shortbook_count: shortbook,
                    alerts: {
                        ...(local.alerts as object),
                        shortbook,
                    },
                };
            } catch {
                return local;
            }
        },
        staleTime: 15_000,
        refetchInterval: METRICS_CONFIG.pollIntervalMs,
    });
}
