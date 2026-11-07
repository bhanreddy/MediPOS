import { AppError } from '../lib/appError';
import { localMutate, queryAll, queryOne, queryRaw } from '../lib/postgresDb';

const OPEN_PO_STATUSES = ['DRAFT', 'SENT', 'PARTIAL'] as const;

const SELLABLE_BATCH_FILTER = '(is_disposed = false OR is_disposed IS NULL)';

export { SELLABLE_BATCH_FILTER };

export async function findBatchForClinic(batchId: string, clinicId: string) {
  const batch = await queryOne(
    'medicine_batches',
    '(_local_id = ? OR id = ?) AND clinic_id = ?',
    [batchId, batchId, clinicId],
  );
  return batch as Record<string, unknown> | undefined;
}

export async function assertNoOpenPurchaseOrderLines(
  clinicId: string,
  medicineId: string,
  batchNumber: string,
): Promise<void> {
  const [tableInfo] = await queryRaw<{ table_name: string | null }>(
    `SELECT to_regclass('public.purchase_orders')::text AS table_name`,
  );
  if (!tableInfo?.table_name) return;

  const openOrders = await queryAll(
    'purchase_orders',
    'clinic_id = ? AND status IN (?, ?, ?)',
    [clinicId, ...OPEN_PO_STATUSES],
  );

  for (const po of openOrders) {
    let lines: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(String((po as Record<string, unknown>).lines_json ?? '[]'));
      lines = Array.isArray(parsed) ? parsed : [];
    } catch {
      lines = [];
    }

    for (const line of lines) {
      const productId = String(line.product_id ?? line.medicine_id ?? '');
      const lineBatch = line.batch_number != null ? String(line.batch_number) : '';
      const qtyOrdered = Number(line.qty_ordered ?? 0);
      const qtyReceived = Number(line.qty_received ?? 0);
      const pending = qtyOrdered > qtyReceived;

      if (!pending || productId !== medicineId) continue;
      if (!lineBatch || lineBatch === batchNumber) {
        throw new AppError(
          409,
          'Cannot dispose this batch while open purchase order lines exist for it.',
          'OPEN_PO_LINES',
        );
      }
    }
  }
}

export async function disposeMedicineBatch(opts: {
  batchId: string;
  clinicId: string;
  userId: string;
  storeId?: string | null;
  reason: string;
  notes?: string | null;
}) {
  const cloud = Boolean(process.env.DATABASE_URL);
  const batch = cloud ? (await queryRaw(
    'SELECT * FROM medicine_batches WHERE (id::text=? OR _local_id=?) AND clinic_id=? AND deleted_at IS NULL FOR UPDATE',
    [opts.batchId,opts.batchId,opts.clinicId],
  ))[0] : await findBatchForClinic(opts.batchId, opts.clinicId);
  if (!batch) {
    throw new AppError(404, 'Batch not found for this clinic.', 'BATCH_NOT_FOUND');
  }

  if (batch.is_disposed === true || batch.is_disposed === 1) {
    throw new AppError(409, 'Batch is already disposed.', 'BATCH_ALREADY_DISPOSED');
  }

  let storeId = opts.storeId ?? null;
  if (cloud) {
    const locations = await queryRaw(
      'SELECT store_id,on_hand FROM branch_stock_snapshot WHERE batch_id=? ORDER BY on_hand DESC,store_id',
      [batch.id],
    );
    if (storeId && !locations.some(row => row.store_id === storeId)) {
      throw new AppError(403, 'The batch is outside the selected branch.');
    }
    storeId ??= locations[0]?.store_id ?? null;
    const positions = await queryRaw(
      `SELECT store_id,quantity_on_hand,quantity_reserved,quantity_in_transit,quantity_stocktake_locked
       FROM inventory_positions WHERE batch_id=? AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
      [batch.id],
    );
    if (locations.some(row => row.store_id !== storeId && Number(row.on_hand) > 0) ||
        positions.some(row => row.store_id !== storeId && Number(row.quantity_on_hand) > 0 ||
          Number(row.quantity_in_transit) > 0 || Number(row.quantity_reserved) > 0 || Number(row.quantity_stocktake_locked) > 0)) {
      throw new AppError(409, 'Resolve stock at other locations, reservations, transit, or stocktakes before disposing of this batch.');
    }
  }

  const medicineId = String(batch.medicine_id ?? '');
  const batchNumber = String(batch.batch_number ?? '');

  await assertNoOpenPurchaseOrderLines(opts.clinicId, medicineId, batchNumber);

  const now = new Date().toISOString();
  const localId = String(batch._local_id ?? batch.id);

  const updated = await localMutate({
    table: 'medicine_batches',
    operation: 'UPDATE',
    data: {
      _local_id: localId,
      quantity_remaining: 0,
      is_disposed: true,
      disposed_at: now,
      disposed_by: opts.userId,
      disposal_reason: opts.reason,
      disposal_notes: opts.notes?.trim() || null,
    },
  });

  if (cloud) {
    if (storeId) await queryRaw(
      `UPDATE inventory_positions SET quantity_on_hand=0,quantity_available=0,quantity_quarantined=0,
       quantity_damaged=0,quantity_recalled=0,quantity_on_hold=0,updated_at=now()
       WHERE batch_id=? AND store_id=? AND deleted_at IS NULL`, [batch.id,storeId],
    );
    if (Number(batch.quantity_remaining) > 0) await queryRaw(
      `INSERT INTO stock_ledger (organization_id,clinic_id,store_id,medicine_id,batch_id,movement_type,
       quantity_delta,balance_after,reference_id,notes,performed_by)
       VALUES (?,?,?,?,?,'DISPOSAL',?,0,?,?,?)`,
      [batch.organization_id ?? null,opts.clinicId,storeId,medicineId,batch.id,
       -Number(batch.quantity_remaining),batch.id,opts.reason,opts.userId],
    );
  }
  return updated;
}

export async function listDisposedBatches(clinicId: string, storeId: string | null = null) {
  const rows = await queryRaw(
    `SELECT mb.*,
            m.name AS medicine_name,
            COALESCE(u.full_name, u.phone, u.id::text) AS disposed_by_label
     FROM medicine_batches mb
     JOIN medicines m ON m.id = mb.medicine_id
     LEFT JOIN users u ON u.id = mb.disposed_by
     WHERE mb.clinic_id = ?
       ${storeId ? "AND EXISTS (SELECT 1 FROM branch_stock_snapshot p WHERE p.batch_id=mb.id AND p.store_id=?)" : ""}
       AND mb.is_disposed = true
       AND mb.deleted_at IS NULL
     ORDER BY mb.disposed_at DESC NULLS LAST`,
    [clinicId, ...(storeId ? [storeId] : [])],
  );
  return rows;
}
