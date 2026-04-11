import { useState, useEffect } from 'react';
import { db } from '../db/index';
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
                const today = new Date().toISOString().split('T')[0];
                const startOfDay = `${today}T00:00:00.000Z`;
                const endOfDay = `${today}T23:59:59.999Z`;

                // 1. Daily Sales
                const todaySales = await db.sales
                    .where('created_at')
                    .between(startOfDay, endOfDay, true, true)
                    .toArray();

                const salesTotal = todaySales.reduce((sum, s) => sum + s.final_amount, 0);

                const lowThresh = METRICS_CONFIG.dashboardLowStockUnitThreshold;
                const lowStockItems = await db.inventory
                    .filter(i => i.quantity > 0 && i.quantity < lowThresh)
                    .count();

                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + METRICS_CONFIG.dashboardExpiringWithinDays);
                const targetStr = targetDate.toISOString().split('T')[0];

                // Check batches expiry
                const expiryingBatches = await db.batches
                    .where('expiry_date')
                    .belowOrEqual(targetStr)
                    .and(b => b.expiry_date >= today) // Not expired yet, but soon
                    .toArray();

                // Filter only those with stock?
                // For speed, let's just count batches for now, or check stock if crit.
                // Better: Check if any inventory exists for these batches.
                let expiringCount = 0;
                for (const b of expiryingBatches) {
                    const hasStock = await db.inventory.where('batch_id').equals(b.id).first();
                    if (hasStock && hasStock.quantity > 0) expiringCount++;
                }

                // 4. Sync Queue
                const syncCount = await db.sync_queue.count();

                setMetrics({
                    dailySales: salesTotal,
                    dailyBillCount: todaySales.length,
                    lowStockCount: lowStockItems,
                    expiringSoonCount: expiringCount,
                    syncPendingCount: syncCount,
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
