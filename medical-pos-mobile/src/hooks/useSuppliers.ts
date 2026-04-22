import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { suppliersApi } from '@/api/suppliers';
import { useUIStore } from '@/stores/uiStore';

/* ─── Types ─────────────────────────────────────────── */

interface SupplierParams {
  q?: string;
}

/* ─── Query Hooks ───────────────────────────────────── */

export function useSuppliers(params?: SupplierParams) {
  return useInfiniteQuery({
    queryKey: ['suppliers', params],
    queryFn: ({ pageParam = 1 }) =>
      suppliersApi.getSuppliers({ ...params, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: ['supplier', id],
    queryFn: () => suppliersApi.getSupplier(id),
    enabled: !!id,
  });
}

export function useSupplierOutstanding(id: string) {
  return useQuery({
    queryKey: ['supplier-outstanding', id],
    queryFn: () => suppliersApi.getSupplierOutstanding(id),
    enabled: !!id,
  });
}

/* ─── Mutation Hooks ────────────────────────────────── */

export function useCreateSupplier() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: suppliersApi.createSupplier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      addToast('Supplier created', 'success');
    },
    onError: () => {
      addToast('Failed to create supplier', 'error');
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof suppliersApi.updateSupplier>[1] }) =>
      suppliersApi.updateSupplier(id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier', variables.id] });
      addToast('Supplier updated', 'success');
    },
    onError: () => {
      addToast('Failed to update supplier', 'error');
    },
  });
}

export function useRecordSupplierPayment() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      suppliersApi.recordSupplierPayment(id, amount),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier', variables.id] });
      qc.invalidateQueries({ queryKey: ['supplier-outstanding', variables.id] });
      addToast('Supplier payment recorded', 'success');
    },
    onError: () => {
      addToast('Failed to record payment', 'error');
    },
  });
}
