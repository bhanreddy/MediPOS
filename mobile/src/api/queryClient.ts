import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

/* ─── Global Error Handler ──────────────────────────── */

function onQueryError(error: unknown): void {
  const axiosErr = error as AxiosError;

  // Only show toasts for network errors — auth/validation handled per-query
  if (!axiosErr.response && axiosErr.code !== 'ECONNABORTED') {
    // Lazy-import to avoid circular deps at module init time
    const { useUIStore } = require('@/stores/uiStore');
    useUIStore.getState().addToast('Network error. Check your connection.', 'error');
  }
}

/* ─── Default Options ───────────────────────────────── */

const defaultOptions: DefaultOptions = {
  queries: {
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10,   // 10 minutes cache retention
    retry: (failureCount, error: any) => {
      const status = error?.response?.status;
      // Never retry on 4xx errors — these are bugs, not transient failures
      if (status >= 400 && status < 500) {
        return false;
      }
      // Only retry 5xx errors once, not 3 times
      return failureCount < 1;
    },
    refetchOnWindowFocus: false,     // CRITICAL: stops refetch on tab switch
    refetchOnReconnect: true,
  },
  mutations: {
    onError: onQueryError,
    retry: 0, // never retry mutations
  },
};

/* ─── Client ────────────────────────────────────────── */

export const queryClient = new QueryClient({ defaultOptions });
