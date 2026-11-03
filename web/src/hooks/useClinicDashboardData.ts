import { useQuery } from '@tanstack/react-query';
import { METRICS_CONFIG } from '../config/appContent';
import api from '../lib/api';

export function useClinicDashboardData() {
    return useQuery({
        queryKey: ['clinic-dashboard'],
        queryFn: async () => {
            const { data } = await api.get('/reports/dashboard');
            return data?.data ?? data;
        },
        staleTime: 15_000,
        refetchInterval: METRICS_CONFIG.pollIntervalMs,
    });
}
