import { useState } from 'react';

export function usePagination(initialLimit = 20) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);

  const resetPage = () => setPage(1);

  return {
    page,
    limit,
    setPage,
    setLimit,
    resetPage,
  };
}
