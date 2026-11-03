import { apiClient } from './client';

/* ─── Types ─────────────────────────────────────────── */

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  manufacturer: string;
  category: string;
  schedule: string;
  hsnCode: string;
  gstRate: number;
  reorderLevel: number;
  createdAt: string;
  /** POS-relevant fields populated by search/list */
  total_stock?: number;
  barcode?: string;
  medicine_batches?: MedicineBatch[];
}

export interface MedicineSearchResult {
  results: Medicine[];
  substitutes: Medicine[];
}

export interface MedicineBatch {
  id: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  purchasePrice: number;
  quantity: number;
}

export interface MedicineDetail extends Medicine {
  batches: MedicineBatch[];
  totalStock: number;
}

export interface StockSummary {
  totalProducts: number;
  totalStockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringWithin30Days: number;
}

export interface MedicineSearchParams {
  q?: string;
  category?: string;
  low_stock?: boolean;
  filter?: string;
  schedule?: string;
  page?: number;
  limit?: number;
}

/** Mirrors `Medical POS Backend` `medicine.schema` create payload (snake_case). */
export type CreateMedicineBody = {
  name: string;
  generic_name?: string | null;
  manufacturer?: string | null;
  category?: 'tablet' | 'syrup' | 'injection' | 'capsule' | 'cream' | 'drops' | 'other';
  hsn_code?: string | null;
  gst_rate?: number;
  unit?: string;
  is_schedule_h1?: boolean;
  low_stock_threshold?: number;
  barcode?: string | null;
};

export type UpdateMedicineBody = Partial<CreateMedicineBody>;

const CATEGORY_UI_TO_DB: Record<string, NonNullable<CreateMedicineBody['category']>> = {
  Tablet: 'tablet',
  Syrup: 'syrup',
  Injection: 'injection',
  Capsule: 'capsule',
  Cream: 'cream',
  Drops: 'drops',
  Other: 'other',
};

export function categoryUiToDb(label: string): NonNullable<CreateMedicineBody['category']> {
  return CATEGORY_UI_TO_DB[label] ?? 'tablet';
}

export function categoryDbToUi(db: string): string {
  const map: Record<string, string> = {
    tablet: 'Tablet',
    syrup: 'Syrup',
    injection: 'Injection',
    capsule: 'Capsule',
    cream: 'Cream',
    drops: 'Drops',
    other: 'Other',
  };
  return map[db.toLowerCase()] ?? db;
}

/** Build POST/PUT body from Add Medicine UI state (aligned with backend Zod schema). */
export function buildMedicinePayloadFromUi(params: {
  name: string;
  genericName: string;
  manufacturer: string;
  categoryLabel: string;
  hsnCode: string;
  gstRate: number;
  reorderLevel: number;
  barcode: string;
  isScheduleH1: boolean;
  unit?: string;
}): CreateMedicineBody {
  const low_stock_threshold = Math.max(1, Math.floor(Number(params.reorderLevel)) || 1);
  const body: CreateMedicineBody = {
    name: params.name.trim(),
    category: categoryUiToDb(params.categoryLabel),
    gst_rate: params.gstRate,
    low_stock_threshold,
    is_schedule_h1: params.isScheduleH1,
    unit: params.unit ?? 'strip',
  };
  const gn = params.genericName.trim();
  const mf = params.manufacturer.trim();
  const hsn = params.hsnCode.trim();
  const bc = params.barcode.trim();
  if (gn) body.generic_name = gn;
  if (mf) body.manufacturer = mf;
  if (hsn) body.hsn_code = hsn;
  if (bc) body.barcode = bc;
  return body;
}

export function normalizeBatchRow(raw: Record<string, unknown>): MedicineBatch {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? r._local_id ?? ''),
    medicineId: String(r.medicine_id ?? r.medicineId ?? ''),
    batchNumber: String(r.batch_number ?? r.batchNumber ?? ''),
    expiryDate: String(r.expiry_date ?? r.expiryDate ?? ''),
    mrp: Number(r.mrp ?? 0),
    purchasePrice: Number(r.purchase_price ?? r.purchasePrice ?? 0),
    quantity: Number(r.quantity_remaining ?? r.quantity ?? 0),
  };
}

/** Clinic `medicines` row from API (snake_case + optional joins). */
export function normalizeMedicineRow(raw: Record<string, unknown>): Medicine {
  const r = raw as Record<string, unknown>;
  const total_stock = r.total_stock != null ? Number(r.total_stock) : undefined;

  const batchesRaw = r.medicine_batches;
  const medicine_batches =
    Array.isArray(batchesRaw) && batchesRaw.length > 0
      ? batchesRaw.map((b) => normalizeBatchRow(b as Record<string, unknown>))
      : undefined;

  return {
    id: String(r.id ?? r._local_id ?? ''),
    name: String(r.name ?? ''),
    genericName: String(r.generic_name ?? r.genericName ?? ''),
    manufacturer: String(r.manufacturer ?? ''),
    category: categoryDbToUi(String(r.category ?? 'tablet')),
    schedule:
      Boolean(r.is_schedule_h1) || String(r.schedule ?? '').toUpperCase().includes('H1')
        ? 'H1'
        : 'None',
    hsnCode: String(r.hsn_code ?? r.hsnCode ?? ''),
    gstRate: Number(r.gst_rate ?? r.gstRate ?? 0),
    reorderLevel: Number(r.low_stock_threshold ?? r.reorderLevel ?? 10),
    createdAt: String(r.created_at ?? r.createdAt ?? r._updated_at ?? ''),
    barcode: r.barcode != null ? String(r.barcode) : '',
    total_stock,
    medicine_batches,
  };
}

/** Master catalog row (`medicine_master`) → UI `Medicine` for autocomplete. */
export function normalizeMasterSuggestion(raw: Record<string, unknown>): Medicine {
  const r = raw as Record<string, unknown>;
  const id =
    r.id != null
      ? String(r.id)
      : `master:${String(r.name ?? '')}:${String(r.generic_name ?? '')}`;
  const schedRaw = String(r.schedule ?? '');
  return {
    id,
    name: String(r.name ?? ''),
    genericName: String(r.generic_name ?? ''),
    manufacturer: String(r.manufacturer ?? ''),
    category: r.category ? categoryDbToUi(String(r.category)) : 'Tablet',
    schedule: schedRaw.toUpperCase().includes('H1') ? 'H1' : 'None',
    hsnCode: String(r.hsn_code ?? ''),
    gstRate: Number(r.gst_rate ?? 0),
    reorderLevel: 10,
    createdAt: '',
  };
}

/* ─── API — All reads from remote, writes disabled on mobile ── */

export const inventoryApi = {
  getMedicines: async (params?: MedicineSearchParams): Promise<Medicine[]> => {
    try {
      const res = await apiClient.get('/inventory/medicines', { params });
      const raw = res.data.data ?? res.data;
      return (Array.isArray(raw) ? raw : []).map((r: Record<string, unknown>) => normalizeMedicineRow(r));
    } catch (error) {
      console.error('[inventoryApi.getMedicines] Error fetching medicines:', error);
      throw error;
    }
  },

  searchMedicines: async (q?: string, barcode?: string): Promise<MedicineSearchResult> => {
    try {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (barcode) params.barcode = barcode;

      const res = await apiClient.get('/inventory/medicines/search', { params });
      const raw = res.data.data ?? res.data;

      const results = (raw.results ?? raw ?? []).map((r: Record<string, unknown>) => normalizeMedicineRow(r));
      const substitutes = (raw.substitutes ?? []).map((r: Record<string, unknown>) => normalizeMedicineRow(r));

      return { results, substitutes };
    } catch (error) {
      console.error('[inventoryApi.searchMedicines] Error searching medicines:', error);
      throw error;
    }
  },

  getMedicine: async (id: string): Promise<MedicineDetail> => {
    try {
      const res = await apiClient.get(`/inventory/medicines/${id}`);
      const raw = res.data.data ?? res.data;
      const batches = (raw.batches ?? raw.medicine_batches ?? []).map((b: Record<string, unknown>) => normalizeBatchRow(b));
      const totalStock = batches.reduce((s: number, b: MedicineBatch) => s + b.quantity, 0);
      const base = normalizeMedicineRow({ ...raw, total_stock: totalStock });
      return { ...base, batches, totalStock };
    } catch (error) {
      console.error(`[inventoryApi.getMedicine] Error fetching medicine detail for id ${id}:`, error);
      throw error;
    }
  },

  /** DISABLED on mobile */
  createMedicine: async (_body: CreateMedicineBody): Promise<Medicine> => {
    throw new Error('Medicine creation is disabled on mobile. Use the desktop app.');
  },

  updateMedicine: async (id: string, body: UpdateMedicineBody): Promise<Medicine> => {
    try {
      const res = await apiClient.put(`/inventory/medicines/${id}`, body);
      const raw = res.data.data ?? res.data;
      return normalizeMedicineRow(raw);
    } catch (error) {
      console.error(`[inventoryApi.updateMedicine] Error updating medicine id ${id}:`, error);
      throw error;
    }
  },

  /** DISABLED on mobile */
  deleteMedicine: async (_id: string): Promise<void> => {
    throw new Error('Medicine deletion is disabled on mobile. Use the desktop app.');
  },

  getExpiringBatches: async (days: number): Promise<(MedicineBatch & { name?: string })[]> => {
    try {
      const res = await apiClient.get('/inventory/batches/expiring', { params: { days } });
      const raw = res.data.data ?? res.data;
      return (Array.isArray(raw) ? raw : []).map((r: Record<string, unknown>) => ({
        ...normalizeBatchRow(r),
        name: r.medicine_name != null ? String(r.medicine_name) : undefined,
      }));
    } catch (error) {
      console.error('[inventoryApi.getExpiringBatches] Error fetching expiring batches:', error);
      throw error;
    }
  },

  getLowStock: async (): Promise<Medicine[]> => {
    try {
      const res = await apiClient.get('/inventory/stock/low');
      const raw = res.data.data ?? res.data;
      return (Array.isArray(raw) ? raw : []).map((r: Record<string, unknown>) => normalizeMedicineRow(r));
    } catch (error) {
      console.error('[inventoryApi.getLowStock] Error fetching low stock medicines:', error);
      throw error;
    }
  },

  getStockSummary: async (): Promise<StockSummary> => {
    try {
      const res = await apiClient.get('/inventory/stock/summary');
      const raw = res.data.data ?? res.data;
      return {
        totalProducts: Number(raw.totalProducts ?? raw.total_products ?? raw.total_medicines ?? 0),
        totalStockValue: Number(raw.totalStockValue ?? raw.total_stock_value ?? 0),
        lowStockCount: Number(raw.lowStockCount ?? raw.low_stock_count ?? 0),
        outOfStockCount: Number(raw.outOfStockCount ?? raw.out_of_stock_count ?? 0),
        expiringWithin30Days: Number(raw.expiringWithin30Days ?? raw.expiring_within_30_days ?? 0),
      };
    } catch (error) {
      console.error('[inventoryApi.getStockSummary] Error fetching stock summary:', error);
      throw error;
    }
  },

  getBatches: async (medicineId: string): Promise<MedicineBatch[]> => {
    try {
      const res = await apiClient.get('/inventory/batches', { params: { medicine_id: medicineId } });
      const raw = res.data.data ?? res.data;
      return (Array.isArray(raw) ? raw : []).map((r: Record<string, unknown>) => normalizeBatchRow(r));
    } catch (error) {
      console.error(`[inventoryApi.getBatches] Error fetching batches for medicine id ${medicineId}:`, error);
      throw error;
    }
  },

  searchMasterMedicines: async (q: string): Promise<Medicine[]> => {
    try {
      const res = await apiClient.get('/inventory/master-search', { params: { q } });
      const raw = res.data.data ?? res.data;
      return (Array.isArray(raw) ? raw : []).map((r: Record<string, unknown>) => normalizeMasterSuggestion(r));
    } catch {
      // Fallback: search in main inventory if master search endpoint doesn't exist
      const res = await apiClient.get('/inventory/search', { params: { q } });
      const raw = res.data.data ?? res.data;
      return (Array.isArray(raw) ? raw : (raw as any).results ?? []).map((r: Record<string, unknown>) => normalizeMasterSuggestion(r));
    }
  },
} as const;
