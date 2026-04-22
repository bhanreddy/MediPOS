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
    staleTime: 30_000,
    gcTime: 600_000,
    retry: (failureCount, error) => {
      const axiosErr = error as AxiosError;
      const status = axiosErr.response?.status;
      // Don't retry auth/forbidden errors
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
    refetchOnWindowFocus: true,
  },
  mutations: {
    onError: onQueryError,
  },
};

/* ─── Client ────────────────────────────────────────── */

export const queryClient = new QueryClient({ defaultOptions });
