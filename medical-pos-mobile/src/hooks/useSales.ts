import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { salesApi } from '@/api/sales';
import { useUIStore } from '@/stores/uiStore';

/* ─── Types ─────────────────────────────────────────── */

interface SalesParams {
  limit?: number;
  from?: string;
  to?: string;
  payment_status?: string;
}

/* ─── Query Hooks ───────────────────────────────────── */

export function useSales(params?: SalesParams) {
  return useInfiniteQuery({
    queryKey: ['sales', params],
    queryFn: ({ pageParam = 1 }) =>
      salesApi.getSales({ ...params, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: ['sale', id],
    queryFn: () => salesApi.getSale(id),
    enabled: !!id,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => salesApi.getInvoice(id),
    enabled: !!id,
  });
}

/* ─── Mutation Hooks ────────────────────────────────── */

export function useCreateSale() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: salesApi.createSale,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      addToast('Sale completed successfully!', 'success');
    },
    onError: () => {
      addToast('Failed to complete sale', 'error');
    },
  });
}

export function useCreateReturn() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: salesApi.createReturn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      addToast('Return processed successfully', 'success');
    },
    onError: () => {
      addToast('Failed to process return', 'error');
    },
  });
}
