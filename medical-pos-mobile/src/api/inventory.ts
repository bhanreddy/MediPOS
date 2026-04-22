import { apiClient } from './client';
import type { AxiosResponse } from 'axios';

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

interface MedicineSearchParams {
  q?: string;
  category?: string;
  low_stock?: boolean;
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
    id: String(r.id ?? ''),
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
  const stockJoined = Array.isArray(r.medicine_stock)
    ? (r.medicine_stock as Record<string, unknown>[])[0]
    : undefined;
  const total_stock =
    r.total_stock != null ? Number(r.total_stock) : stockJoined?.total_stock != null ? Number(stockJoined.total_stock) : undefined;

  const batchesRaw = r.medicine_batches;
  const medicine_batches =
    Array.isArray(batchesRaw) && batchesRaw.length > 0
      ? batchesRaw.map((b) => normalizeBatchRow(b as Record<string, unknown>))
      : undefined;

  return {
    id: String(r.id ?? ''),
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
    createdAt: String(r.created_at ?? r.createdAt ?? ''),
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

function normalizeLowStockRow(raw: Record<string, unknown>): Medicine {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.medicine_id ?? r.id ?? ''),
    name: String(r.medicine_name ?? r.name ?? ''),
    genericName: '',
    manufacturer: '',
    category: 'Tablet',
    schedule: 'None',
    hsnCode: '',
    gstRate: 0,
    reorderLevel: Number(r.low_stock_threshold ?? 10),
    createdAt: '',
    total_stock: r.total_stock != null ? Number(r.total_stock) : undefined,
  };
}

function normalizeExpiryAlertRow(raw: Record<string, unknown>): MedicineBatch & { name?: string } {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.batch_id ?? r.id ?? ''),
    medicineId: String(r.medicine_id ?? ''),
    batchNumber: String(r.batch_number ?? ''),
    expiryDate: String(r.expiry_date ?? ''),
    mrp: Number(r.mrp ?? 0),
    purchasePrice: 0,
    quantity: Number(r.quantity_remaining ?? r.quantity ?? 0),
    name: r.medicine_name != null ? String(r.medicine_name) : undefined,
  };
}

function normalizeMedicineDetailPayload(raw: Record<string, unknown>): MedicineDetail {
  const batchesRaw = raw.batches;
  const batches = Array.isArray(batchesRaw)
    ? batchesRaw.map((b) => normalizeBatchRow(b as Record<string, unknown>))
    : [];
  const base = normalizeMedicineRow(raw);
  const totalStock = batches.reduce((s, b) => s + b.quantity, 0);
  return { ...base, batches, totalStock };
}

/* ─── Helpers ───────────────────────────────────────── */

function extract<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data;
}

/* ─── API ───────────────────────────────────────────── */

export const inventoryApi = {
  getMedicines: async (params?: MedicineSearchParams): Promise<Medicine[]> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[] }>('/inventory/medicines', { params });
    return extract(res).map((row) => normalizeMedicineRow(row));
  },

  searchMedicines: async (q?: string, barcode?: string): Promise<MedicineSearchResult> => {
    const res = await apiClient.get<{ data?: MedicineSearchResult; results?: unknown[]; substitutes?: unknown[] }>(
      '/inventory/medicines/search',
      {
        params: { q, barcode },
      },
    );
    const payload = res.data.data ?? res.data;
    const rawResults = (payload as { results?: unknown[] }).results ?? [];
    const rawSubs = (payload as { substitutes?: unknown[] }).substitutes ?? [];
    const results = rawResults.map((row) => normalizeMedicineRow(row as Record<string, unknown>));
    const substitutes = rawSubs.map((row) => normalizeMedicineRow(row as Record<string, unknown>));
    return { results, substitutes };
  },

  getMedicine: async (id: string): Promise<MedicineDetail> => {
    const res = await apiClient.get<{ data: Record<string, unknown> }>(`/inventory/medicines/${id}`);
    return normalizeMedicineDetailPayload(extract(res));
  },

  createMedicine: async (body: CreateMedicineBody): Promise<Medicine> => {
    const res = await apiClient.post<{ data: Record<string, unknown> }>('/inventory/medicines', body);
    return normalizeMedicineRow(extract(res));
  },

  updateMedicine: async (id: string, body: UpdateMedicineBody): Promise<Medicine> => {
    const res = await apiClient.put<{ data: Record<string, unknown> }>(`/inventory/medicines/${id}`, body);
    return normalizeMedicineRow(extract(res));
  },

  deleteMedicine: async (id: string): Promise<void> => {
    await apiClient.delete(`/inventory/medicines/${id}`);
  },

  getExpiringBatches: async (days: number): Promise<(MedicineBatch & { name?: string })[]> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[] }>('/inventory/batches/expiring', {
      params: { days },
    });
    return extract(res).map((row) => normalizeExpiryAlertRow(row));
  },

  getLowStock: async (): Promise<Medicine[]> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[] }>('/inventory/stock/low');
    return extract(res).map((row) => normalizeLowStockRow(row));
  },

  getStockSummary: async (): Promise<StockSummary> => {
    const res = await apiClient.get<{
      data: {
        total_medicines?: number;
        total_products?: number;
        total_stock_value?: number;
        low_stock_count?: number;
        out_of_stock_count?: number;
        expiring_within_30_days?: number;
      };
    }>('/inventory/stock/summary');
    const d = extract(res);
    return {
      totalProducts: Number(d.total_medicines ?? d.total_products ?? 0),
      totalStockValue: Number(d.total_stock_value ?? 0),
      lowStockCount: Number(d.low_stock_count ?? 0),
      outOfStockCount: Number(d.out_of_stock_count ?? 0),
      expiringWithin30Days: Number(d.expiring_within_30_days ?? 0),
    };
  },

  getBatches: async (medicineId: string): Promise<MedicineBatch[]> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[] }>('/inventory/batches', {
      params: { medicine_id: medicineId },
    });
    return extract(res).map((row) => normalizeBatchRow(row));
  },

  searchMasterMedicines: async (q: string): Promise<Medicine[]> => {
    const res = await apiClient.get<{ data: Record<string, unknown>[] }>('/medicines/master/search', {
      params: { q },
    });
    return extract(res).map((row) => normalizeMasterSuggestion(row));
  },
} as const;
