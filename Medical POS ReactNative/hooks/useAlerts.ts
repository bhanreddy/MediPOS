import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../lib/api';
import { api } from '../lib/api';
import { useAlertStore } from '../store/alertStore';
import { useSessionStore } from '../store/sessionStore';

export function useAlerts() {
  const setAlerts = useAlertStore((state) => state.setAlerts);
  const { user } = useSessionStore();

  const { data: dashboardData } = useQuery({
    queryKey: ['alerts_dashboard', user?.clinic_id],
    queryFn: () => api.get('/reports/dashboard').then(res => res.data.data),
    enabled: !!user?.clinic_id,
    refetchInterval: 1000 * 60 * 30, // 30 minutes
  });

  useEffect(() => {
    if (dashboardData) {
      setAlerts({
        lowStockCount: dashboardData.low_stock_count || 0,
        expiryCount: dashboardData.expiry_count_30d || 0,
        shortbookCount: dashboardData.shortbook_count || 0,
      });
    }
  }, [dashboardData, setAlerts]);

  const { lowStockCount, expiryCount, shortbookCount } = useAlertStore();
  const totalAlerts = lowStockCount + expiryCount + shortbookCount;

  return {
    lowStockCount,
    expiryCount,
    shortbookCount,
    totalAlerts,
  };
}
