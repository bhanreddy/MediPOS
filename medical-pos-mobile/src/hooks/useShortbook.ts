import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shortbookApi } from '@/api/shortbook';
import { useUIStore } from '@/stores/uiStore';

/* ─── Query Hooks ───────────────────────────────────── */

export function useShortbook() {
  return useQuery({
    queryKey: ['shortbook'],
    queryFn: shortbookApi.getShortbook,
  });
}

/* ─── Mutation Hooks ────────────────────────────────── */

export function useAddToShortbook() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: shortbookApi.addToShortbook,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortbook'] });
      addToast('Added to shortbook', 'success');
    },
    onError: () => {
      addToast('Failed to add to shortbook', 'error');
    },
  });
}

export function useMarkOrdered() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: shortbookApi.markOrdered,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortbook'] });
      addToast('Marked as ordered', 'success');
    },
    onError: () => {
      addToast('Failed to update shortbook item', 'error');
    },
  });
}

export function useRemoveFromShortbook() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: shortbookApi.removeFromShortbook,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortbook'] });
      addToast('Removed from shortbook', 'success');
    },
    onError: () => {
      addToast('Failed to remove from shortbook', 'error');
    },
  });
}
