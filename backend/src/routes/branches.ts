import { branchAnalytics } from '../services/branchAnalytics';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac';
import { queryRaw } from '../lib/postgresDb';
import { AppError } from '../lib/appError';
import { resolveCloudStoreContext } from '../services/cloudStoreContext';
import { StockTransferService } from '../services/transfers/stockTransferService';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { transactionalRoute } from '../lib/transactionalRoute';
import { listAccessibleCloudStores } from '../services/cloudStoreContext';

export const branchesRouter = Router();
branchesRouter.get('/accessible', requireAuth, transactionalRoute(async (req, res) => {
  const actor = req.user!;
  const data = actor.clinic_id ? await listAccessibleCloudStores(actor.clinic_id, { userId: actor.id, role: actor.role }) : [];
  res.json({ data, default_store_id: data[0]?.id ?? null });
}));

branchesRouter.get('/sister-stock/:id', requireAuth, requireRole('OWNER','PHARMACIST','CASHIER'), transactionalRoute(async (req, res) => {
  const actor = req.user!;
  const clinicId = actor.clinic_id!;
  const { storeId } = await resolveCloudStoreContext(clinicId, {});
  const [medicine] = await queryRaw(
    'SELECT id FROM medicines WHERE (id::text=? OR _local_id=?) AND clinic_id=? AND deleted_at IS NULL',
    [req.params.id, req.params.id, clinicId],
  );
  if (!medicine) throw new AppError(404, 'Medicine not found.');
  const allowed = await listAccessibleCloudStores(clinicId, { userId: actor.id, role: actor.role });
  const peerIds = allowed.filter(store => store.id !== storeId).map(store => store.id);
  const showBatch = actor.role === 'OWNER' || actor.role === 'PHARMACIST';
  const data = await queryRaw(
    `SELECT s.store_id, COALESCE(st.display_name,st.name) AS store_name,
       SUM(s.available)::int AS available_quantity,
       CASE WHEN ?::boolean THEN jsonb_agg(jsonb_build_object('batch',s.batch_number,'expiry',s.expiry_date,'quantity',s.available)
         ORDER BY s.expiry_date, s.batch_id) ELSE '[]'::jsonb END AS batches
     FROM branch_stock_snapshot s JOIN stores st ON st.id=s.store_id
     WHERE s.clinic_id=? AND s.medicine_id=? AND s.available>0 AND s.store_id=ANY(?::uuid[])
     GROUP BY s.store_id, st.id, st.name, st.display_name ORDER BY store_name`,
    [showBatch, clinicId, medicine.id, peerIds],
  );
  res.json({ data, can_request: actor.role === 'OWNER' || actor.role === 'PHARMACIST' });
}));

branchesRouter.post('/sister-stock/:id/request', requireAuth, requireRole('OWNER','PHARMACIST'), transactionalRoute(async (req, res) => {
  const input = z.object({
    source_store_id: z.string().uuid(),
    quantity: z.number().int().positive().max(10000),
    request_id: z.string().uuid(),
  }).parse(req.body);
  const actor = req.user!;
  const clinicId = actor.clinic_id!;
  const source = await resolveCloudStoreContext(clinicId, { store_id: input.source_store_id });
  const destination = await resolveCloudStoreContext(clinicId, {});
  if (!source.storeId || !destination.storeId || !source.organizationId || source.storeId === destination.storeId) {
    throw new AppError(409, 'Choose a different accessible source store.');
  }
  const medicineId = z.string().uuid().parse(req.params.id);
  const [medicine] = await queryRaw(
    `SELECT id FROM medicines WHERE id=? AND clinic_id=? AND deleted_at IS NULL
       AND is_active AND NOT prescription_required AND NOT is_schedule_h1
       AND COALESCE(schedule_classification,'NONE')='NONE'`,
    [medicineId,clinicId],
  );
  if (!medicine) throw new AppError(409, 'This medicine requires the transfer workspace or is unavailable.');
  const transfer = await StockTransferService.createTransfer({
    organizationId: source.organizationId, transferType: 'STORE_TO_STORE',
    sourceLocationType: 'STORE', sourceLocationId: source.storeId,
    destinationLocationType: 'STORE', destinationLocationId: destination.storeId,
    requestedBy: actor.id, idempotencyKey: input.request_id, requireAvailableStock: true,
    notes: 'Requested at the POS from sister-store stock',
    items: [{ medicineId, requestedQuantity: input.quantity }],
  });
  res.status(201).json({ data: transfer });
}));

branchesRouter.get('/analytics', requireAuth, requireRole('OWNER'), transactionalRoute(async (req, res) => {
  const { from, to } = z.object({ from: z.string().date(), to: z.string().date() }).parse(req.query);
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) {
    throw new AppError(400, 'Select a reporting period of at most 366 days.');
  }
  res.json({ data: await branchAnalytics(req.user!.clinic_id!, from, to) });
}));
