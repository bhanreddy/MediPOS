import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/api/analytics';

export function useRevenueTrend(period: string, range: string) {
  return useQuery({
    queryKey: ['revenue-trend', period, range],
    queryFn: () => analyticsApi.getRevenueTrend(period, range),
  });
}

interface MedicinePerformanceParams {
  from?: string;
  to?: string;
  sort?: string;
}

export function useMedicinePerformance(params?: MedicinePerformanceParams) {
  return useQuery({
    queryKey: ['medicine-performance', params],
    queryFn: () => analyticsApi.getMedicinePerformance(params),
  });
}

export function useCustomerInsights() {
  return useQuery({
    queryKey: ['customer-insights'],
    queryFn: analyticsApi.getCustomerInsights,
  });
}

export function useInventoryHealth() {
  return useQuery({
    queryKey: ['inventory-health'],
    queryFn: analyticsApi.getInventoryHealth,
  });
}

export function usePaymentBehaviour() {
  return useQuery({
    queryKey: ['payment-behaviour'],
    queryFn: analyticsApi.getPaymentBehaviour,
  });
}

export function usePurchaseIntelligence() {
  return useQuery({
    queryKey: ['purchase-intelligence'],
    queryFn: analyticsApi.getPurchaseIntelligence,
    staleTime: 120_000,
  });
}
