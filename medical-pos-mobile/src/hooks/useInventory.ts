import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '@/api/inventory';
import { shortbookApi } from '@/api/shortbook';
import { salesApi } from '@/api/sales';
import { useUIStore } from '@/stores/uiStore';

/* ─── Query Hooks ───────────────────────────────────── */

interface MedicineParams {
  q?: string;
  category?: string;
  low_stock?: boolean;
  page?: number;
  limit?: number;
}

export function useMedicines(params?: MedicineParams) {
  return useQuery({
    queryKey: ['medicines', params],
    queryFn: () => inventoryApi.getMedicines(params),
    staleTime: 30_000,
  });
}

export function useSearchMedicines(q: string) {
  return useQuery({
    queryKey: ['medicine-search', q],
    queryFn: () => inventoryApi.searchMedicines(q),
    enabled: q.length > 1,
    staleTime: 10_000,
  });
}

export function useMedicine(id: string) {
  return useQuery({
    queryKey: ['medicine', id],
    queryFn: () => inventoryApi.getMedicine(id),
    enabled: !!id,
  });
}

export function useLowStock() {
  return useQuery({
    queryKey: ['low-stock'],
    queryFn: inventoryApi.getLowStock,
  });
}

export function useExpiringBatches(days: number) {
  return useQuery({
    queryKey: ['expiring', days],
    queryFn: () => inventoryApi.getExpiringBatches(days),
  });
}

export function useStockSummary() {
  return useQuery({
    queryKey: ['stock-summary'],
    queryFn: inventoryApi.getStockSummary,
  });
}

export function useMedicineBatches(medicineId: string) {
  return useQuery({
    queryKey: ['medicine-batches', medicineId],
    queryFn: () => inventoryApi.getBatches(medicineId),
    enabled: !!medicineId,
  });
}

export function useMasterSearch(q: string) {
  return useQuery({
    queryKey: ['master-search', q],
    queryFn: () => inventoryApi.searchMasterMedicines(q),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}

/* ─── Mutation Hooks ────────────────────────────────── */

export function useCreateMedicine() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: inventoryApi.createMedicine,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      addToast('Medicine created successfully', 'success');
    },
    onError: () => {
      addToast('Failed to create medicine', 'error');
    },
  });
}

export function useUpdateMedicine() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof inventoryApi.updateMedicine>[1] }) =>
      inventoryApi.updateMedicine(id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine', variables.id] });
      addToast('Medicine updated successfully', 'success');
    },
    onError: () => {
      addToast('Failed to update medicine', 'error');
    },
  });
}

export function useDeleteMedicine() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: inventoryApi.deleteMedicine,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      addToast('Medicine deleted', 'success');
    },
    onError: () => {
      addToast('Failed to delete medicine', 'error');
    },
  });
}

export function useAddToShortbook() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: (medicineId: string) =>
      shortbookApi.addToShortbook({ medicine_id: medicineId, reason: 'manual' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['shortbook'] });
      addToast('Added to Shortbook', 'success');
    },
    onError: () => {
      addToast('Failed to add to Shortbook', 'error');
    },
  });
}

/* ─── Legacy aliases ────────────────────────────────── */

/**
 * Legacy hook used by POS screen — maps old `useInventory(search)` to new API.
 */
export function useInventory(search = '') {
  return useQuery({
    queryKey: ['medicines', { q: search }],
    queryFn: async () => {
      if (search) {
        const result = await inventoryApi.searchMedicines(search);
        return [...(result.results ?? []), ...(result.substitutes ?? [])];
      }
      return inventoryApi.getMedicines();
    },
  });
}

/**
 * Legacy hook used by POS screen for checkout.
 */
export function useCheckout() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: salesApi.createSale,
    onSuccess: () => {
      addToast('Sale completed successfully!', 'success');
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
    },
    onError: () => {
      addToast('Failed to complete sale', 'error');
    },
  });
}
