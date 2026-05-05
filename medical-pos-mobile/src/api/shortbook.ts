import { queryAll } from '../lib/localQuery';
import { localMutate } from '../lib/localMutate';

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

/* ─── API ───────────────────────────────────────────── */

export const shortbookApi = {
  getShortbook: async (): Promise<ShortbookItem[]> => {
    const rows = await queryAll<Record<string, any>>('shortbook', 'is_ordered=0');
    return rows.map(r => ({
      id: String(r.id ?? r._local_id ?? ''),
      medicineName: String(r.medicine_name ?? r.medicine_id ?? ''),
      genericName: '',
      requestedQty: Number(r.quantity_needed ?? 0),
      isOrdered: Boolean(r.is_ordered),
      addedAt: String(r.created_at ?? r._updated_at ?? ''),
      orderedAt: r.ordered_at ? String(r.ordered_at) : null,
    }));
  },

  addToShortbook: async (body: AddToShortbookBody): Promise<ShortbookItem> => {
    const record = await localMutate({ table: 'shortbook', operation: 'INSERT', data: body });
    return record as unknown as ShortbookItem;
  },

  markOrdered: async (id: string): Promise<ShortbookItem> => {
    const record = await localMutate({ table: 'shortbook', operation: 'UPDATE', data: { is_ordered: true, ordered_at: new Date().toISOString(), _local_id: id } });
    return record as unknown as ShortbookItem;
  },

  removeFromShortbook: async (id: string): Promise<void> => {
    await localMutate({ table: 'shortbook', operation: 'DELETE', data: { _local_id: id } });
  },
} as const;
