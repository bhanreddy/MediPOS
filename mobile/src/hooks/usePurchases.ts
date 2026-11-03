import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { purchasesApi } from '@/api/purchases';
import { useUIStore } from '@/stores/uiStore';

/* ─── Types ─────────────────────────────────────────── */

interface PurchaseParams {
  limit?: number;
  supplier_id?: string;
  status?: string;
}

/* ─── Query Hooks ───────────────────────────────────── */

export function usePurchases(params?: PurchaseParams) {
  return useInfiniteQuery({
    queryKey: ['purchases', params],
    queryFn: ({ pageParam = 1 }) =>
      purchasesApi.getPurchases({ ...params, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: ['purchase', id],
    queryFn: () => purchasesApi.getPurchase(id),
    enabled: !!id,
  });
}

/* ─── Mutation Hooks ────────────────────────────────── */

export function useCreatePurchase() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: purchasesApi.createPurchase,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['stock-summary'] });
      addToast('Purchase recorded', 'success');
    },
    onError: () => {
      addToast('Failed to record purchase', 'error');
    },
  });
}

export function useUpdatePurchasePayment() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof purchasesApi.updatePayment>[1] }) =>
      purchasesApi.updatePayment(id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['purchase', variables.id] });
      addToast('Payment updated', 'success');
    },
    onError: () => {
      addToast('Failed to update payment', 'error');
    },
  });
}

export function useScanBill() {
  return useMutation({
    mutationFn: ({ imageBase64, mimeType }: { imageBase64: string; mimeType: string }) =>
      purchasesApi.scanBill(imageBase64, mimeType),
  });
}
