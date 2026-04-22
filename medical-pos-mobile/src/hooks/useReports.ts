import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports';

export function useProfitLoss(from?: string, to?: string) {
  return useQuery({
    queryKey: ['reports', 'profit-loss', from, to],
    queryFn: () => reportsApi.getProfitLoss(from ?? '', to ?? ''),
    enabled: !!from && !!to,
  });
}

export function useProductWise(from?: string, to?: string) {
  return useQuery({
    queryKey: ['reports', 'product-wise', from, to],
    queryFn: () => reportsApi.getProductWise(from ?? '', to ?? ''),
    enabled: !!from && !!to,
  });
}

export function useExpiryReport(days: number) {
  return useQuery({
    queryKey: ['reports', 'expiry', days],
    queryFn: () => reportsApi.getExpiryReport(days),
  });
}

export function useSlowMoving(days: number) {
  return useQuery({
    queryKey: ['reports', 'slow-moving', days],
    queryFn: () => reportsApi.getSlowMoving(days),
  });
}

export function useGstSales(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'gst-sales', from, to],
    queryFn: () => reportsApi.getGstSales(from, to),
    enabled: !!from && !!to,
  });
}

export function useScheduleH1(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'schedule-h1', from, to],
    queryFn: () => reportsApi.getScheduleH1(from, to),
    enabled: !!from && !!to,
  });
}

export function useGstr1(month: number, year: number) {
  return useQuery({
    queryKey: ['reports', 'gstr1', month, year],
    queryFn: () => reportsApi.getGstr1(month, year),
    enabled: month > 0 && year > 0,
  });
}

/* ─── Legacy aliases ────────────────────────────────── */

/**
 * Legacy hook — reports screen uses `useTopProducts()` which returned
 * the product-wise data sorted by revenue. Now returns it unsorted;
 * screens can sort themselves.
 */
export function useTopProducts() {
  return useQuery({
    queryKey: ['reports', 'product-wise'],
    queryFn: () => reportsApi.getProductWise('', ''),
  });
}
