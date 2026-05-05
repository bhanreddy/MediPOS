import { queryAll, queryOne, queryRaw, queryCount } from '../lib/localQuery';
import { localMutate } from '../lib/localMutate';

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

/* ─── API ───────────────────────────────────────────── */

export const inventoryApi = {
  getMedicines: async (params?: MedicineSearchParams): Promise<Medicine[]> => {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params?.q) {
      conditions.push('(name LIKE ? OR generic_name LIKE ? OR manufacturer LIKE ?)');
      values.push(`%${params.q}%`, `%${params.q}%`, `%${params.q}%`);
    }
    if (params?.category) { conditions.push('category=?'); values.push(params.category); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const rows = await queryAll<Record<string, unknown>>('medicines', where, values);

    // Attach stock totals
    for (const row of rows) {
      const medId = row._local_id ?? row.id;
      const batches = await queryAll<Record<string, unknown>>(
        'medicine_batches',
        'medicine_id=?',
        [medId as string]
      );
      (row as any).total_stock = batches.reduce(
        (sum, b) => sum + Number(b.quantity_remaining ?? 0), 0
      );
    }

    // Filter low stock if requested
    if (params?.low_stock) {
      return rows
        .filter(r => Number((r as any).total_stock ?? 0) <= Number(r.low_stock_threshold ?? 10))
        .map(normalizeMedicineRow);
    }

    return rows.map(normalizeMedicineRow);
  },

  searchMedicines: async (q?: string, barcode?: string): Promise<MedicineSearchResult> => {
    const conditions: string[] = [];
    const values: any[] = [];

    if (barcode) { conditions.push('barcode=?'); values.push(barcode); }
    else if (q) {
      conditions.push('(name LIKE ? OR generic_name LIKE ?)');
      values.push(`%${q}%`, `%${q}%`);
    }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const rows = await queryAll<Record<string, unknown>>('medicines', where, values);

    // Attach batches to each medicine
    for (const row of rows) {
      const medId = row._local_id ?? row.id;
      const batches = await queryAll<Record<string, unknown>>(
        'medicine_batches',
        'medicine_id=? AND quantity_remaining>0',
        [medId as string]
      );
      (row as any).medicine_batches = batches;
      (row as any).total_stock = batches.reduce(
        (sum, b) => sum + Number(b.quantity_remaining ?? 0), 0
      );
    }

    // Find substitutes by generic name
    const results = rows.map(normalizeMedicineRow);
    let substitutes: Medicine[] = [];
    if (results.length > 0 && results[0].genericName) {
      const subRows = await queryAll<Record<string, unknown>>(
        'medicines',
        'generic_name LIKE ? AND (_local_id!=? AND (id IS NULL OR id!=?))',
        [`%${results[0].genericName}%`, String(results[0].id), String(results[0].id)]
      );
      substitutes = subRows.map(normalizeMedicineRow);
    }

    return { results, substitutes };
  },

  getMedicine: async (id: string): Promise<MedicineDetail> => {
    const row = await queryOne<Record<string, unknown>>(
      'medicines',
      '_local_id=? OR id=?',
      [id, id]
    );
    if (!row) throw new Error('Medicine not found');

    const medId = row._local_id ?? row.id;
    const batchRows = await queryAll<Record<string, unknown>>(
      'medicine_batches',
      'medicine_id=?',
      [medId as string]
    );
    const batches = batchRows.map(normalizeBatchRow);
    const totalStock = batches.reduce((s, b) => s + b.quantity, 0);
    const base = normalizeMedicineRow({ ...row, total_stock: totalStock });
    return { ...base, batches, totalStock };
  },

  createMedicine: async (body: CreateMedicineBody): Promise<Medicine> => {
    const record = await localMutate({ table: 'medicines', operation: 'INSERT', data: body });
    return normalizeMedicineRow(record as Record<string, unknown>);
  },

  updateMedicine: async (id: string, body: UpdateMedicineBody): Promise<Medicine> => {
    const existing = await queryOne<Record<string, unknown>>('medicines', '_local_id=? OR id=?', [id, id]);
    const record = await localMutate({
      table: 'medicines',
      operation: 'UPDATE',
      data: { ...(existing ?? {}), ...body, _local_id: id }
    });
    return normalizeMedicineRow(record as Record<string, unknown>);
  },

  deleteMedicine: async (id: string): Promise<void> => {
    await localMutate({ table: 'medicines', operation: 'DELETE', data: { _local_id: id } });
  },

  getExpiringBatches: async (days: number): Promise<(MedicineBatch & { name?: string })[]> => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const targetStr = targetDate.toISOString().split('T')[0];

    const rows = await queryRaw<Record<string, unknown>>(
      `SELECT mb.*, m.name as medicine_name
       FROM medicine_batches mb
       LEFT JOIN medicines m ON m._local_id = mb.medicine_id
       WHERE mb._deleted=0 AND mb.quantity_remaining>0 AND mb.expiry_date<=?
       ORDER BY mb.expiry_date ASC`,
      [targetStr]
    );

    return rows.map(r => ({
      id: String(r.id ?? r._local_id ?? ''),
      medicineId: String(r.medicine_id ?? ''),
      batchNumber: String(r.batch_number ?? ''),
      expiryDate: String(r.expiry_date ?? ''),
      mrp: Number(r.mrp ?? 0),
      purchasePrice: Number(r.purchase_price ?? 0),
      quantity: Number(r.quantity_remaining ?? 0),
      name: r.medicine_name != null ? String(r.medicine_name) : undefined,
    }));
  },

  getLowStock: async (): Promise<Medicine[]> => {
    const rows = await queryRaw<Record<string, unknown>>(
      `SELECT m.*, COALESCE(SUM(mb.quantity_remaining), 0) as total_stock
       FROM medicines m
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m._local_id AND mb._deleted=0
       WHERE m._deleted=0 AND m.is_active=1
       GROUP BY m._local_id
       HAVING total_stock <= m.low_stock_threshold`
    );
    return rows.map(normalizeMedicineRow);
  },

  getStockSummary: async (): Promise<StockSummary> => {
    const totalProducts = await queryCount('medicines', 'is_active=1');

    const stockRows = await queryRaw<{ total_val: number; total_stock: number; med_id: string; threshold: number }>(
      `SELECT m._local_id as med_id, m.low_stock_threshold as threshold,
              COALESCE(SUM(mb.quantity_remaining * mb.mrp), 0) as total_val,
              COALESCE(SUM(mb.quantity_remaining), 0) as total_stock
       FROM medicines m
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m._local_id AND mb._deleted=0
       WHERE m._deleted=0 AND m.is_active=1
       GROUP BY m._local_id`
    );

    const totalStockValue = stockRows.reduce((a, r) => a + Number(r.total_val), 0);
    const lowStockCount = stockRows.filter(r => Number(r.total_stock) > 0 && Number(r.total_stock) <= Number(r.threshold)).length;
    const outOfStockCount = stockRows.filter(r => Number(r.total_stock) === 0).length;

    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split('T')[0];
    const expiringRows = await queryRaw<{ cnt: number }>(
      `SELECT COUNT(DISTINCT medicine_id) as cnt FROM medicine_batches
       WHERE _deleted=0 AND quantity_remaining>0 AND expiry_date<=?`,
      [in30Str]
    );

    return {
      totalProducts,
      totalStockValue,
      lowStockCount,
      outOfStockCount,
      expiringWithin30Days: Number(expiringRows[0]?.cnt ?? 0),
    };
  },

  getBatches: async (medicineId: string): Promise<MedicineBatch[]> => {
    const rows = await queryAll<Record<string, unknown>>(
      'medicine_batches',
      'medicine_id=?',
      [medicineId]
    );
    return rows.map(normalizeBatchRow);
  },

  searchMasterMedicines: async (q: string): Promise<Medicine[]> => {
    // Master catalog search falls back to local medicines when offline
    const rows = await queryAll<Record<string, unknown>>(
      'medicines',
      'name LIKE ? OR generic_name LIKE ?',
      [`%${q}%`, `%${q}%`]
    );
    return rows.map(normalizeMasterSuggestion);
  },
} as const;
