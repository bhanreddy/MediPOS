import { useState, useEffect } from 'react';
import api from '../lib/api';
import { METRICS_CONFIG } from '../config/appContent';

export interface DashboardMetrics {
    dailySales: number;
    dailyBillCount: number;
    lowStockCount: number;
    expiringSoonCount: number;
    syncPendingCount: number;
    lastBackup: string;
}

export const useDashboardMetrics = () => {
    const [metrics, setMetrics] = useState<DashboardMetrics>({
        dailySales: 0,
        dailyBillCount: 0,
        lowStockCount: 0,
        expiringSoonCount: 0,
        syncPendingCount: 0,
        lastBackup: 'Never'
    });

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                // Fetch sales, low stock count, and expiring batches from backend directly
                const [salesRes, lowStockRes, expiringRes] = await Promise.all([
                    api.get('/sales'),
                    api.get('/inventory/stock/low'),
                    api.get('/inventory/batches/expiring?days=30')
                ]);

                const sales = salesRes.data?.data || salesRes.data || [];
                const lowStock = lowStockRes.data?.data || lowStockRes.data || [];
                const expiring = expiringRes.data?.data || expiringRes.data || [];

                const today = new Date().toISOString().split('T')[0];
                const todaySales = sales.filter((s: any) => {
                    const dateStr = (s.created_at || s.sale_date || '').split('T')[0];
                    return dateStr === today;
                });

                const salesTotal = todaySales.reduce((sum: number, s: any) => sum + Number(s.final_amount || 0), 0);

                setMetrics({
                    dailySales: salesTotal,
                    dailyBillCount: todaySales.length,
                    lowStockCount: lowStock.length,
                    expiringSoonCount: expiring.length,
                    syncPendingCount: 0, // Online-first has 0 sync pending items
                    lastBackup: METRICS_CONFIG.lastBackupPlaceholder
                });

            } catch (error) {
                console.error("Failed to load dashboard metrics", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, METRICS_CONFIG.pollIntervalMs);
        return () => clearInterval(interval);

    }, []);

    return { metrics, isLoading };
};
