import { QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient instance.
 * Extracted from main.tsx so the sync engine can invalidate caches
 * without importing from the entry-point module.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,       // 2 minutes
      gcTime: 1000 * 60 * 10,         // 10 minutes cache retention
      retry: (failureCount, error: any) => {
        // Never retry on 4xx errors — these are bugs, not transient failures
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Only retry 5xx errors once, not 3 times
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,     // CRITICAL: stops refetch on tab switch
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0, // never retry mutations
    },
  },
});
