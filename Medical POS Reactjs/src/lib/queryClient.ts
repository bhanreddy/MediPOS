import { QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient instance.
 * Extracted from main.tsx so the sync engine can invalidate caches
 * without importing from the entry-point module.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
