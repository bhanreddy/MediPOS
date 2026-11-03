import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports';
import type { DashboardData } from '@/api/reports';

export function useDashboardData(active = true) {
  return useQuery({
    enabled: active,
    queryKey: ['dashboard'],
    queryFn: reportsApi.getDashboard,
    staleTime: 60_000,
    refetchInterval: active ? 60_000 : false,
  });
}

// Legacy aliases for backward compat
export const useDashboardMetrics = useDashboardData;

export function useRecentTransactions() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: reportsApi.getDashboard,
    staleTime: 60_000,
    select: (data: DashboardData) => data.recent_activity,
  });
}
