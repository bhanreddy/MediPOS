import api from './api';

/** Used for complete report exports; fail explicitly rather than silently truncate. */
export async function fetchAllPages<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data } = await api.get(path, { params: { ...params, page, limit: 100 } });
    rows.push(...(data.data || []));
    if (!data.pagination || page >= data.pagination.totalPages) return rows;
  }
  throw new Error('This report is too large. Choose a shorter date range.');
}
