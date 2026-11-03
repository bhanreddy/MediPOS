import { apiClient } from './client';

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

/* ─── API — Remote reads, writes disabled on mobile ── */

export const shortbookApi = {
  getShortbook: async (): Promise<ShortbookItem[]> => {
    const res = await apiClient.get('/shortbook');
    const raw = res.data.data ?? res.data;
    return (Array.isArray(raw) ? raw : []).map((r: Record<string, any>) => ({
      id: String(r.id ?? ''),
      medicineName: String(r.medicine_name ?? r.medicine_id ?? ''),
      genericName: String(r.generic_name ?? ''),
      requestedQty: Number(r.quantity_needed ?? 0),
      isOrdered: Boolean(r.is_ordered),
      addedAt: String(r.created_at ?? ''),
      orderedAt: r.ordered_at ? String(r.ordered_at) : null,
    }));
  },

  /** DISABLED on mobile */
  addToShortbook: async (_body: AddToShortbookBody): Promise<ShortbookItem> => {
    throw new Error('Shortbook modifications are disabled on mobile. Use the desktop app.');
  },

  /** DISABLED on mobile */
  markOrdered: async (_id: string): Promise<ShortbookItem> => {
    throw new Error('Shortbook modifications are disabled on mobile. Use the desktop app.');
  },

  /** DISABLED on mobile */
  removeFromShortbook: async (_id: string): Promise<void> => {
    throw new Error('Shortbook modifications are disabled on mobile. Use the desktop app.');
  },
} as const;
