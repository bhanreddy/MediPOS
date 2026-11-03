import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

/** Search the entire directory on the server, with cancellation and cached pages. */
export function useDirectory<T>(endpoint: string, search: string, filters: Record<string, string> = {}) {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState(search.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);
  const limit = 25;
  const query = useQuery({
    queryKey: ['directory', endpoint, page, term, filters],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ data: T[]; pagination: { total: number } }>(endpoint, { params: { page, limit, q: term, ...filters }, signal });
      return data;
    },
  });
  return { rows: query.data?.data ?? [], total: query.data?.pagination.total ?? 0,
    page, limit, setPage, loading: query.isPending || search.trim() !== term,
    error: query.isError, refresh: query.refetch, fetching: query.isFetching };
}
