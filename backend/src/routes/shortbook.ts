import { localMutate, queryAll, queryOne, queryRaw, queryCount } from '../lib/postgresDb';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { addToShortbookSchema } from '../schemas/shortbook.schema';

import { ShortbookV2Service } from '../services/inventory/shortbookV2Service';
import { transactionalRoute } from '../lib/transactionalRoute';
import { createReorderDrafts, createReorderDraftsSchema, getReorderWorkspace } from '../services/procurement/reorderWorkspaceService';
import { AppError } from '../lib/appError';
import { currentOrderMessage } from '../services/procurement/supplierMessaging';

export const shortbookRouter = Router();

shortbookRouter.get('/workspace', requireAuth, async (req, res, next) => {
  try { res.json({ data: await getReorderWorkspace(req.user!.clinic_id!) }); }
  catch (error) { next(error); }
});

shortbookRouter.post('/draft-orders', requireAuth, requireRole('OWNER'), transactionalRoute(async (req, res, next) => {
  try {
    const input = createReorderDraftsSchema.parse(req.body);
    res.status(201).json({ data: await createReorderDrafts(req.user!.clinic_id!, input) });
  } catch (error) { next(error); }
}));

shortbookRouter.get('/order-drafts', requireAuth, async (req, res, next) => {
  try {
    const data = await queryRaw(`SELECT p.id, p.po_number, p.supplier_id, p.status, p.lines_json, p.created_at,
      s.name AS supplier_name, m.body, m.channel FROM purchase_orders p
      JOIN supplier_message_drafts m ON m.purchase_order_id=p.id AND m.clinic_id=p.clinic_id
      JOIN suppliers s ON s.id=p.supplier_id AND s.clinic_id=p.clinic_id
      WHERE p.clinic_id=? AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 100`, [req.user!.clinic_id!]);
    res.json({ data: data.map(currentOrderMessage) });
  } catch (error) { next(error); }
});

shortbookRouter.get('/order-drafts/:id', requireAuth, async (req, res, next) => {
  try {
    const [data] = await queryRaw(`SELECT p.*, s.name AS supplier_name, m.body, m.channel FROM purchase_orders p
      JOIN supplier_message_drafts m ON m.purchase_order_id=p.id AND m.clinic_id=p.clinic_id
      JOIN suppliers s ON s.id=p.supplier_id AND s.clinic_id=p.clinic_id
      WHERE p.id::text=? AND p.clinic_id=? AND p.deleted_at IS NULL`, [req.params.id, req.user!.clinic_id!]);
    if (!data) throw new AppError(404, 'Reorder draft not found.');
    res.json({ data: currentOrderMessage(data) });
  } catch (error) { next(error); }
});

shortbookRouter.post('/order-drafts/:id/cancel', requireAuth, requireRole('OWNER'), transactionalRoute(async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    await queryRaw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [`reorder:${clinicId}`]);
    const [order] = await queryRaw(`SELECT p.* FROM purchase_orders p
      JOIN supplier_message_drafts m ON m.purchase_order_id=p.id AND m.clinic_id=p.clinic_id
      WHERE p.id::text=? AND p.clinic_id=? AND p.deleted_at IS NULL FOR UPDATE OF p`, [req.params.id, clinicId]);
    if (!order) throw new AppError(404, 'Reorder draft not found.');
    if (!['DRAFT', 'SENT', 'PARTIAL', 'CANCELLED'].includes(order.status)) throw new AppError(409, 'A fully received order cannot be cancelled.');
    await localMutate({ table: 'purchase_orders', operation: 'UPDATE', data: { _local_id: order._local_id || order.id, status: 'CANCELLED' } });
    await queryRaw(`UPDATE supplier_message_drafts SET status='CANCELLED', updated_at=now() WHERE clinic_id=? AND purchase_order_id=?`, [clinicId, order.id]);
    res.json({ data: { id: order.id, status: 'CANCELLED' } });
  } catch (error) { next(error); }
}));

// GET /api/shortbook/consolidated
shortbookRouter.get('/consolidated', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id;
    const data = (await ShortbookV2Service.getConsolidatedShortbook(clinicId));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/shortbook
shortbookRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const data = await queryRaw('SELECT * FROM shortbook WHERE is_ordered=false AND clinic_id=?', [clinicId]);
    data.sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/shortbook
shortbookRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = addToShortbookSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = await localMutate({ table: 'shortbook', operation: 'INSERT', data: payload });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/shortbook/:id/ordered
shortbookRouter.patch('/:id/ordered', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const existing = await queryOne('shortbook', '(_local_id = ? OR id = ?) AND clinic_id = ?', [req.params.id, req.params.id, clinicId]);
    if (!existing) {
      return res.status(404).json({ error: 'Shortbook item not found' });
    }
    const localId = (existing as any)._local_id || (existing as any).id;

    const data = await localMutate({
      table: 'shortbook',
      operation: 'UPDATE',
      data: { is_ordered: true, ordered_at: new Date().toISOString(), _local_id: localId }
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shortbook/:id
shortbookRouter.delete('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const result = await queryRaw('DELETE FROM shortbook WHERE (_local_id = ? OR id = ?) AND clinic_id = ?', [req.params.id, req.params.id, clinicId]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default shortbookRouter;
