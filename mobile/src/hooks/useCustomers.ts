import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { customersApi } from '@/api/customers';
import { useUIStore } from '@/stores/uiStore';

/* ─── Types ─────────────────────────────────────────── */

interface CustomerParams {
  q?: string;
  limit?: number;
}

/* ─── Query Hooks ───────────────────────────────────── */

export function useCustomersPaginated(params?: CustomerParams) {
  return useInfiniteQuery({
    queryKey: ['customers', params],
    queryFn: ({ pageParam = 1 }) =>
      customersApi.getCustomers({ ...params, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.getCustomer(id),
    enabled: !!id,
  });
}

export function useCustomerOutstanding(id: string) {
  return useQuery({
    queryKey: ['customer-outstanding', id],
    queryFn: () => customersApi.getOutstanding(id),
    enabled: !!id,
  });
}

export function useDueReminders() {
  return useQuery({
    queryKey: ['reminders'],
    queryFn: customersApi.getDueReminders,
    refetchInterval: 300_000,
  });
}

/* ─── Mutation Hooks ────────────────────────────────── */

export function useCreateCustomer() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: customersApi.createCustomer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      addToast('Customer created', 'success');
    },
    onError: () => {
      addToast('Failed to create customer', 'error');
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof customersApi.updateCustomer>[1] }) =>
      customersApi.updateCustomer(id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', variables.id] });
      addToast('Customer updated', 'success');
    },
    onError: () => {
      addToast('Failed to update customer', 'error');
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof customersApi.recordPayment>[1] }) =>
      customersApi.recordPayment(id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', variables.id] });
      qc.invalidateQueries({ queryKey: ['customer-outstanding', variables.id] });
      qc.invalidateQueries({ queryKey: ['reminders'] });
      addToast('Payment recorded', 'success');
    },
    onError: () => {
      addToast('Failed to record payment', 'error');
    },
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  const addToast = useUIStore.getState().addToast;

  return useMutation({
    mutationFn: customersApi.createReminder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      addToast('Reminder added successfully', 'success');
    },
    onError: () => {
      addToast('Failed to add reminder', 'error');
    },
  });
}

/* ─── Legacy alias ──────────────────────────────────── */

/**
 * Legacy hook for existing Patients screen that calls `useCustomers(search)`.
 */
export function useCustomers(search = '') {
  return useQuery({
    queryKey: ['customers', { q: search }],
    queryFn: async () => {
      const result = await customersApi.getCustomers(search ? { q: search } : undefined);
      return result.data;
    },
  });
}
