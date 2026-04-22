import { apiClient } from './client';
import type { AxiosResponse } from 'axios';

/* ─── Types ─────────────────────────────────────────── */

export interface ShortbookItem {
  id: string;
  medicineName: string;
  genericName: string;
  requestedQty: number;
  isOrdered: boolean;
  addedAt: string;
  orderedAt: string | null;
}

/** Matches Medical POS Backend addToShortbookSchema (shortbook.schema.ts) — snake_case wire format. */
export interface AddToShortbookBody {
  medicine_id: string;
  reason?: 'low_stock' | 'expired' | 'manual';
  quantity_needed?: number;
  preferred_supplier_id?: string | null;
}

/* ─── Helpers ───────────────────────────────────────── */

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

/* ─── API ───────────────────────────────────────────── */

export const shortbookApi = {
  getShortbook: async (): Promise<ShortbookItem[]> => {
    const res = await apiClient.get<{ data: ShortbookItem[] }>('/shortbook');
    return extract(res);
  },

  addToShortbook: async (body: AddToShortbookBody): Promise<ShortbookItem> => {
    const res = await apiClient.post<{ data: ShortbookItem }>('/shortbook', body);
    return extract(res);
  },

  markOrdered: async (id: string): Promise<ShortbookItem> => {
    const res = await apiClient.patch<{ data: ShortbookItem }>(`/shortbook/${id}/ordered`);
    return extract(res);
  },

  removeFromShortbook: async (id: string): Promise<void> => {
    await apiClient.delete(`/shortbook/${id}`);
  },
} as const;
