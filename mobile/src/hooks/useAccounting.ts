import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '@/api/accounting';

export function useAccountingSummary(from: string, to: string) {
  return useQuery({
    queryKey: ['accounting-summary', from, to],
    queryFn: () => accountingApi.getAccountingSummary(from, to),
    enabled: !!from && !!to,
  });
}
