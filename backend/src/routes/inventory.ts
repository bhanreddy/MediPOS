import { selectedCloudStore } from '../services/cloudStoreContext';
import { transactionalRoute } from '../lib/transactionalRoute';
import { tenantRecord } from '../lib/tenantRecords';
import { requireStoreAccess } from '../middleware/storeAccess';
import { LocationService } from '../services/transfers/locationService';
import { Router } from 'express';
import { AppError } from '../lib/appError';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createMedicineSchema, updateMedicineSchema } from '../schemas/medicine.schema';
import { disposeBatchSchema } from '../schemas/inventory.schema';
import { localMutate, queryAll, queryOne, queryRaw, queryCount } from '../lib/postgresDb';
import {
  SELLABLE_BATCH_FILTER,
  disposeMedicineBatch,
  listDisposedBatches,
} from '../services/batchDisposal';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);
inventoryRouter.use(async (req,res,next)=>{
  if(!process.env.DATABASE_URL || !/^\/(availability|cross-location|reconciliation|stocktakes|reorder-recommendations|expiry-risk|ageing|classifications|recalls|reservations|alerts|valuation)(\/|$)/.test(req.path)) return next();
  if (req.query.warehouse_id) {
    try {
      const supportsWarehouse = /^\/(availability|reconciliation(?:\/repair)?|stocktakes|reservations|valuation)\/?$/.test(req.path);
      if (!supportsWarehouse || typeof req.query.warehouse_id !== 'string' || req.query.store_id || req.body?.store_id) {
        throw new AppError(400, 'Choose a single inventory location.');
      }
      const actor = req.user!;
      const orgId = actor.organization_id || actor.clinic_id!;
      const warehouse = await tenantRecord('warehouses', req.query.warehouse_id, orgId);
      if (!(await LocationService.validateUserAccess(actor.id, 'WAREHOUSE', warehouse.id, orgId))) {
        throw new AppError(403, 'Warehouse access denied.');
      }
      req.query.warehouse_id = warehouse.id;
      return next();
    } catch (error) { return next(error); }
  }
  return requireStoreAccess()(req,res,next);
});
inventoryRouter.param('id', async (req, _res, next, id) => {
  const resource = /^\/(stocktakes|recalls|alerts|reservations)\//.exec(req.path)?.[1];
  if (!resource) return next();
  try {
    const tables: Record<string, string> = {stocktakes:'stocktake_sessions',recalls:'product_recalls',alerts:'inventory_alerts',reservations:'inventory_reservations'};
    const {orgId} = resolveOrgAndStore(req);
    const row = (await localDb.prepare(`SELECT * FROM ${tables[resource]} WHERE (id = ? OR _local_id = ?) AND organization_id = ? AND _deleted = 0`).get(id,id,orgId)) as {id:string;store_id?:string;warehouse_id?:string} | undefined;
    if (!row) throw new AppError(404, 'Inventory record not found');
    if(process.env.DATABASE_URL && row.store_id && row.store_id!==req.storeContext?.storeId && !['OWNER','SUPER_ADMIN'].includes(req.user!.role)) throw new AppError(403,'Store access denied');
    if (process.env.DATABASE_URL && row.warehouse_id &&
        !(await LocationService.validateUserAccess(req.user!.id,'WAREHOUSE',row.warehouse_id,orgId))) {
      throw new AppError(403, 'Warehouse access denied.');
    }
    req.params.id = row.id;
    next();
  } catch (error) { next(error); }
});

// GET /api/inventory/medicines/search?q=&barcode=
inventoryRouter.get('/medicines/search', requireAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const barcode = typeof req.query.barcode === 'string' ? req.query.barcode.trim() : '';
    const clinicId = req.user!.clinic_id;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 25, 100));
    const clinicClause = clinicId ? ' AND clinic_id=?' : '';
    const clinicParams = clinicId ? [clinicId] : [];
    let searchSql: string;
    let searchParams: any[];

    if (barcode) {
      searchSql = `SELECT * FROM medicines WHERE deleted_at IS NULL AND barcode=? AND is_active=true${clinicClause}
         ORDER BY name, id LIMIT ?`;
      searchParams = [barcode, ...clinicParams, limit];
    } else if (q) {
      const literal = q.replace(/[\\%_]/g, '\\$&');
      searchSql = `SELECT * FROM medicines WHERE deleted_at IS NULL
           AND (name ILIKE ? OR generic_name ILIKE ?) AND is_active=true${clinicClause}
         ORDER BY CASE WHEN LOWER(name)=LOWER(?) THEN 0 WHEN name ILIKE ? THEN 1 ELSE 2 END,
                  name, id LIMIT ?`;
      searchParams = [`%${literal}%`, `%${literal}%`, ...clinicParams, q, `${literal}%`, limit];
    } else {
      return res.json({ results: [], substitutes: [] });
    }

    // POS needs the ranked page plus sellable FEFO snapshots, not substitutes.
    // Aggregate all ranked product keys in one database round trip.
    if (req.query.include_substitutes === 'false') {
      const branch = selectedCloudStore();
      const stockSource = branch ? `medicine_batches b
        JOIN branch_stock_snapshot position ON position.batch_id=b.id AND position.store_id=?` : 'medicine_batches b';
      const quantity = branch ? 'position.available' : 'b.quantity_remaining';
      const results = await queryRaw(
        `WITH page AS MATERIALIZED (${searchSql}),
         page_keys AS (
           SELECT id AS product_id, id AS medicine_id, clinic_id FROM page
           UNION
           SELECT id, _local_id::uuid, clinic_id FROM page
           WHERE _local_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         ), stock AS (
           SELECT keys.product_id,
                  jsonb_agg(to_jsonb(b) || jsonb_build_object('quantity_remaining', ${quantity}) ORDER BY b.expiry_date, b.id) AS medicine_batches,
                  SUM(${quantity}) AS total_stock
           FROM ${stockSource} JOIN page_keys keys ON keys.medicine_id=b.medicine_id AND keys.clinic_id=b.clinic_id
           WHERE b.deleted_at IS NULL AND ${quantity}>0 AND b.is_disposed IS NOT TRUE AND b.expiry_date>=?
           GROUP BY keys.product_id
         )
         SELECT page.*, COALESCE(stock.medicine_batches,'[]'::jsonb) AS medicine_batches,
                COALESCE(stock.total_stock,0) AS total_stock
         FROM page LEFT JOIN stock ON stock.product_id=page.id
         ORDER BY ${barcode ? '' : 'CASE WHEN LOWER(page.name)=LOWER(?) THEN 0 WHEN page.name ILIKE ? THEN 1 ELSE 2 END,'}
                  page.name, page.id`,
        [...searchParams, ...(branch ? [branch] : []), new Date().toISOString().split('T')[0], ...(barcode ? [] : [q, `${q.replace(/[\\%_]/g, '\\$&')}%`])],
      );
      return res.json({ results, substitutes: [] });
    }
    const results = await queryRaw(searchSql, searchParams);

    // One stock read for the bounded page; group once instead of filtering for every product.
    const medicineIds = [...new Set(results.flatMap(med => [med.id, med._local_id]).filter(Boolean))];
    if (medicineIds.length > 0) {
      const placeholders = medicineIds.map(() => '?').join(',');
      const today = new Date().toISOString().split('T')[0];
      const branch = selectedCloudStore();
      const allBatches = branch ? await queryRaw(
        `SELECT b.*, p.available AS quantity_remaining FROM medicine_batches b
         JOIN branch_stock_snapshot p ON p.batch_id=b.id AND p.store_id=?
         WHERE b.medicine_id IN (${placeholders}) AND p.available>0
         ORDER BY b.expiry_date,b.id`, [branch,...medicineIds],
      ) : await queryRaw(
        `SELECT * FROM medicine_batches WHERE medicine_id IN (${placeholders})
         AND quantity_remaining > 0 AND deleted_at IS NULL AND ${SELLABLE_BATCH_FILTER}
         AND expiry_date >= ?${clinicClause} ORDER BY expiry_date ASC, id ASC`,
        [...medicineIds, today, ...clinicParams]);
      const grouped = new Map<string, any[]>();
      for (const batch of allBatches) {
        const group = grouped.get(batch.medicine_id);
        if (group) group.push(batch);
        else grouped.set(batch.medicine_id, [batch]);
      }
      for (const med of results) {
        const batches = [...(grouped.get(med.id) || [])];
        if (med._local_id !== med.id) batches.push(...(grouped.get(med._local_id) || []));
        batches.sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
        med.medicine_batches = batches;
        med.total_stock = batches.reduce((sum, batch) => sum + Number(batch.quantity_remaining || 0), 0);
      }
    }

    // Billing does not render these; other consumers can still request substitutes.
    let substitutes: any[] = [];
    const genericNames = [...new Set(results.map(med => med.generic_name).filter(Boolean))];
    if (req.query.include_substitutes !== 'false' && genericNames.length > 0) {
      const placeholders = genericNames.map(() => '?').join(',');
      const resultIds = new Set(results.map(med => med.id));
      const allGeneric = await queryRaw(
        `SELECT * FROM medicines WHERE deleted_at IS NULL AND is_active=true
         AND generic_name IN (${placeholders})${clinicClause} ORDER BY name, id LIMIT 100`,
        [...genericNames, ...clinicParams]);
      substitutes = allGeneric.filter(med => !resultIds.has(med.id)).slice(0, 15);
    }
    res.json({ results, substitutes });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/medicines
inventoryRouter.get('/medicines', requireAuth, async (req, res, next) => {
  try {
    const q = req.query.q as string;
    const category = req.query.category as string;
    const lowStock = req.query.low_stock === 'true';
    const scheduleH1 = req.query.schedule_h1 === 'true';

    const clinicId = req.user!.clinic_id;
    const conditions: string[] = ['is_active=true'];
    const values: any[] = [];

    if (clinicId) {
      conditions.push('clinic_id=?');
      values.push(clinicId);
    }

    if (q) { conditions.push('(name ILIKE ? OR generic_name ILIKE ?)'); values.push(`%${q}%`, `%${q}%`); }
    if (category) { conditions.push('category=?'); values.push(category); }
    if (scheduleH1) { conditions.push('is_schedule_h1=true'); }

    const rawSize = req.query.page_size;
    const cursor = req.query.after;
    const pageSize = rawSize === undefined ? undefined : Number(rawSize);
    if ((pageSize !== undefined && (typeof rawSize !== 'string' || !/^\d{1,3}$/.test(rawSize) ||
        pageSize < 1 || pageSize > 500)) || (cursor !== undefined && (
        pageSize === undefined || typeof cursor !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cursor)))) {
      throw new AppError(400, 'Invalid inventory catalogue page.');
    }
    if (cursor) {
      conditions.push('id>?');
      values.push(cursor);
    }
    const where = conditions.join(' AND ');
    const batchClinicClause = clinicId ? ' AND medicine_batches.clinic_id = ?' : '';
    const branch = selectedCloudStore();
    const stockSource = branch ? 'JOIN branch_stock_snapshot p ON p.batch_id=medicine_batches.id AND p.store_id=?' : '';
    const quantity = branch ? 'p.available' : 'medicine_batches.quantity_remaining';
    const medicines = pageSize === undefined ? await queryAll('medicines', where, values) : await queryRaw(
      `SELECT * FROM medicines WHERE deleted_at IS NULL AND (${where}) ORDER BY id LIMIT ?`,
      [...values,pageSize+1],
    );
    const nextCursor = pageSize !== undefined && medicines.length > pageSize ? medicines[pageSize-1].id : null;
    if (nextCursor) medicines.pop();
    const batchMedicineIds = [...new Set(medicines.flatMap(med => [med.id, med._local_id])
      .filter((id): id is string => typeof id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)))];
    const allBatches = batchMedicineIds.length ? await queryRaw(
      `SELECT medicine_batches.*${branch ? `, ${quantity} AS quantity_remaining` : ''} FROM medicine_batches ${stockSource}
       WHERE medicine_batches.medicine_id=ANY(?::uuid[])
         AND ${quantity}>0 AND medicine_batches.deleted_at IS NULL AND ${SELLABLE_BATCH_FILTER}${batchClinicClause}
       ORDER BY medicine_batches.expiry_date ASC`,
      [...(branch ? [branch] : []), batchMedicineIds, ...(clinicId ? [clinicId] : [])],
    ) : [];

    // Attach stock totals
    const batchesByMedicine = new Map<string, any[]>();
    for (const batch of allBatches) {
      const group = batchesByMedicine.get(batch.medicine_id);
      if (group) group.push(batch);
      else batchesByMedicine.set(batch.medicine_id, [batch]);
    }
    let data = medicines;
    for (const med of data) {
      const batches = [...(batchesByMedicine.get(med.id) || [])];
      if (med._local_id && med._local_id !== med.id) batches.push(...(batchesByMedicine.get(med._local_id) || []));
      batches.sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
      (med as any).medicine_batches = batches;
      (med as any).total_stock = batches.reduce(
        (s: number, b: any) => s + Number(b.quantity_remaining ?? 0),
        0,
      );
    }

    if (lowStock) {
      data = data.filter((d: any) => (d.total_stock ?? 0) <= (d.low_stock_threshold ?? 10));
    }

    res.json(pageSize === undefined ? { data } : { data, next_cursor: nextCursor });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/attention-counts?today=YYYY-MM-DD&warning=YYYY-MM-DD
// Header badges. Same batch rules as the inventory screen, without sending the whole catalog.
inventoryRouter.get('/attention-counts', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id;
    if (!clinicId) return res.status(400).json({ error: 'No clinic associated with this account.' });
    const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const today = isDay(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
    let warning = isDay(req.query.warning) ? req.query.warning : '';
    if (!warning || warning < today) {
      const fallback = new Date(`${today}T00:00:00Z`);
      fallback.setUTCDate(fallback.getUTCDate() + 30);
      warning = fallback.toISOString().slice(0, 10);
    }
    const branch = selectedCloudStore();
    const stockSource = branch ? 'JOIN branch_stock_snapshot p ON p.batch_id=mb.id AND p.store_id=?' : '';
    const onHand = branch ? 'p.on_hand' : 'mb.quantity_remaining';
    const available = branch ? 'p.available' : 'mb.quantity_remaining';
    const [row] = await queryRaw<{ low_stock: number; expiring: number; shortbook: number }>(
      `WITH medicines_in_scope AS (
         SELECT id, _local_id, GREATEST(COALESCE(low_stock_threshold, 10), 0) AS min_alert
         FROM medicines WHERE clinic_id = ? AND deleted_at IS NULL AND is_active = true
       ), batches AS (
         SELECT m.id AS medicine_id, ${available} AS qty, mb.expiry_date
         FROM medicines_in_scope m
         JOIN medicine_batches mb ON (mb.medicine_id::text = m.id::text OR mb.medicine_id::text = m._local_id::text)
         ${stockSource}
         WHERE mb.clinic_id = ? AND mb.deleted_at IS NULL AND ${onHand} > 0
           AND (mb.is_disposed = false OR mb.is_disposed IS NULL)
       ), stock AS (
         SELECT m.id, m.min_alert,
                COALESCE(SUM(b.qty) FILTER (WHERE b.expiry_date >= ?::date), 0) AS available
         FROM medicines_in_scope m LEFT JOIN batches b ON b.medicine_id = m.id
         GROUP BY m.id, m.min_alert
       )
       SELECT
         (SELECT COUNT(*)::int FROM stock WHERE available <= min_alert) AS low_stock,
         (SELECT COUNT(*)::int FROM batches WHERE expiry_date <= ?::date) AS expiring,
         (SELECT COUNT(*)::int FROM shortbook WHERE clinic_id = ? AND is_ordered = false AND deleted_at IS NULL) AS shortbook`,
      [clinicId, ...(branch ? [branch] : []), clinicId, today, warning, clinicId],
    );
    res.json({
      data: {
        low_stock: Number(row?.low_stock ?? 0),
        expiring: Number(row?.expiring ?? 0),
        shortbook: Number(row?.shortbook ?? 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/medicines/:id
inventoryRouter.get('/medicines/:id', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const medicine = await queryOne('medicines', '(id=? OR _local_id=?) AND is_active=true AND clinic_id=?', [req.params.id, req.params.id, clinicId]);
    if (!medicine) {
      return res.status(404).json({ error: { message: 'Medicine not found', code: 'NOT_FOUND' } });
    }

    const medId = (medicine as any).id;
    const branch = selectedCloudStore();
    const batches = branch ? await queryRaw(
      `SELECT b.*, p.available AS quantity_remaining FROM medicine_batches b
       JOIN branch_stock_snapshot p ON p.batch_id=b.id AND p.store_id=?
       WHERE b.clinic_id=? AND b.medicine_id=? AND p.available>0`, [branch,clinicId,medId],
    ) : await queryAll('medicine_batches', `medicine_id=? AND clinic_id=? AND ${SELLABLE_BATCH_FILTER}`, [medId,clinicId]);
    batches.sort((a: any, b: any) => String(a.expiry_date ?? '').localeCompare(String(b.expiry_date ?? '')));

    res.json({ data: { ...medicine, batches } });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/medicines
inventoryRouter.post('/medicines', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = createMedicineSchema.parse(req.body);
    if (parsed.store_id) await resolveCloudStoreContext(req.user!.clinic_id!, { store_id: parsed.store_id });
    if (parsed.preferred_supplier_id && !await queryOne('suppliers', 'id = ? AND clinic_id = ?', [parsed.preferred_supplier_id, req.user!.clinic_id]))
      throw new AppError(404, 'Supplier not found');
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = await localMutate({ table: 'medicines', operation: 'INSERT', data: payload });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/medicines/:id
inventoryRouter.put('/medicines/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = updateMedicineSchema.parse(req.body);
    if (parsed.store_id) await resolveCloudStoreContext(req.user!.clinic_id!, { store_id: parsed.store_id });
    if (parsed.preferred_supplier_id && !await queryOne('suppliers', 'id = ? AND clinic_id = ?', [parsed.preferred_supplier_id, req.user!.clinic_id]))
      throw new AppError(404, 'Supplier not found');
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };
    const clinicId = req.user!.clinic_id;
    const clinicClause = clinicId ? ' AND clinic_id=?' : '';
    const clinicParams = clinicId ? [clinicId] : [];
    const medicine = await queryOne(
      'medicines',
      `(_local_id=? OR id=?)${clinicClause}`,
      [req.params.id, req.params.id, ...clinicParams],
    );

    if (!medicine) {
      return res.status(404).json({ error: { message: 'Medicine not found', code: 'NOT_FOUND' } });
    }

    const localId = String((medicine as any)._local_id || (medicine as any).id);
    if (!(medicine as any)._local_id) {
      await queryRaw('UPDATE medicines SET _local_id=? WHERE id=? AND _local_id IS NULL', [localId, (medicine as any).id]);
    }

    const data = await localMutate({ table: 'medicines', operation: 'UPDATE', data: { ...payload, _local_id: localId } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inventory/medicines/:id
inventoryRouter.delete('/medicines/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const existing = await queryOne('medicines', '(_local_id=? OR id=?) AND clinic_id=?', [req.params.id, req.params.id, clinicId]);
    if (!existing) {
      return res.status(404).json({ error: 'Medicine not found' });
    }
    const localId = (existing as any)._local_id || (existing as any).id;

    const data = await localMutate({ table: 'medicines', operation: 'DELETE', data: { _local_id: localId } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/batches/disposed
inventoryRouter.get('/batches/disposed', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id;
    if (!clinicId) {
      return res.status(403).json({ error: { message: 'Clinic context required', code: 'NO_CLINIC' } });
    }
    const data = await listDisposedBatches(clinicId, selectedCloudStore());
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/batches/:batchId/dispose
inventoryRouter.post('/batches/:batchId/dispose', requireAuth, transactionalRoute(async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id;
    if (!clinicId) {
      return res.status(403).json({ error: { message: 'Clinic context required', code: 'NO_CLINIC' } });
    }

    const parsed = disposeBatchSchema.parse(req.body);
    const data = await disposeMedicineBatch({
      batchId: req.params.batchId,
      clinicId,
      userId: req.user!.id,
      storeId: selectedCloudStore(),
      reason: parsed.reason,
      notes: parsed.notes,
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}));

// GET /api/inventory/batches
inventoryRouter.get('/batches', requireAuth, async (req, res, next) => {
  try {
    const medicineId = typeof req.query.medicine_id === 'string' ? req.query.medicine_id : null;
    const clinicId = req.user!.clinic_id!;
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || 100)) || 100, 1000));
    const includeUnavailable = req.query.include_unavailable === 'true';
    const conditions = ['clinic_id = ?', 'deleted_at IS NULL'];
    const params: unknown[] = [clinicId];
    const branch = selectedCloudStore();
    if (branch) {
      conditions.push('EXISTS (SELECT 1 FROM branch_stock_snapshot p WHERE p.batch_id = medicine_batches.id AND p.store_id = ?)');
      params.push(branch);
    }
    if (medicineId) { conditions.push('medicine_id = ?'); params.push(medicineId); }
    if (!includeUnavailable) conditions.push(SELLABLE_BATCH_FILTER);
    params.push(limit);
    const data = branch ? await queryRaw(
      `SELECT b.*, p.on_hand AS quantity_remaining FROM medicine_batches b
       JOIN branch_stock_snapshot p ON p.batch_id=b.id AND p.store_id=?
       WHERE b.clinic_id=? AND b.deleted_at IS NULL
         ${medicineId ? 'AND b.medicine_id=?' : ''} ${includeUnavailable ? '' : 'AND p.available>0'}
       ORDER BY b.expiry_date,b.id LIMIT ?`, [branch,clinicId,...(medicineId ? [medicineId] : []),limit],
    ) : await queryRaw(`SELECT * FROM medicine_batches WHERE ${conditions.join(' AND ')} ORDER BY expiry_date ASC, id ASC LIMIT ?`, params);

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/batches/expiring
inventoryRouter.get('/batches/expiring', requireAuth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + days);
    const maxStr = maxDate.toISOString().split('T')[0];
    const clinicId = req.user!.clinic_id!;

    const branch = selectedCloudStore();
    const data = branch ? await queryRaw(
      `SELECT b.*,p.on_hand AS quantity_remaining FROM medicine_batches b
       JOIN branch_stock_snapshot p ON p.batch_id=b.id AND p.store_id=?
       WHERE b.clinic_id=? AND p.on_hand>0 AND b.expiry_date<=?
         AND b.is_disposed IS NOT TRUE AND b.is_recalled IS NOT TRUE`,
      [branch,clinicId,maxStr],
    ) : await queryAll(
      'medicine_batches',
      `quantity_remaining>0 AND expiry_date<=? AND clinic_id=? AND ${SELLABLE_BATCH_FILTER}`,
      [maxStr, clinicId],
    );
    data.sort((a: any, b: any) => String(a.expiry_date ?? '').localeCompare(String(b.expiry_date ?? '')));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stock/low
inventoryRouter.get('/stock/low', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const branch = selectedCloudStore();
    const data = branch ? await queryRaw(
      `SELECT m.*,COALESCE(SUM(p.available),0) AS total_stock FROM medicines m
       LEFT JOIN branch_stock_snapshot p ON p.medicine_id=m.id AND p.store_id=?
       WHERE m.clinic_id=? AND m.deleted_at IS NULL AND m.is_active GROUP BY m.id
       HAVING COALESCE(SUM(p.available),0)<=COALESCE(m.low_stock_threshold,10)`,
      [branch,clinicId],
    ) : await queryRaw(
      `SELECT m.*, COALESCE(SUM(mb.quantity_remaining), 0) as total_stock
       FROM medicines m
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id AND mb.deleted_at IS NULL AND mb.clinic_id = ? AND (mb.is_disposed = false OR mb.is_disposed IS NULL)
       WHERE m.deleted_at IS NULL AND m.is_active=true AND m.clinic_id = ?
       GROUP BY m.id
       HAVING COALESCE(SUM(mb.quantity_remaining), 0) <= COALESCE(m.low_stock_threshold, 10)`,
      [clinicId, clinicId]
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stock/summary
inventoryRouter.get('/stock/summary', requireAuth, async (req, res, next) => {
  try {
    const clinicId = req.user!.clinic_id!;
    const medCount = await queryRaw<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM medicines WHERE deleted_at IS NULL AND is_active=true AND clinic_id = ?`,
      [clinicId]
    );

    const branch = selectedCloudStore();
    const batchStats = branch ? await queryRaw<{ total_batches: number; total_stock_value: number }>(
      `SELECT COUNT(*) AS total_batches,COALESCE(SUM(p.on_hand*p.purchase_price),0) AS total_stock_value
       FROM branch_stock_snapshot p JOIN medicine_batches b ON b.id=p.batch_id
       WHERE p.store_id=? AND p.clinic_id=? AND p.on_hand>0 AND b.is_disposed IS NOT TRUE`,
      [branch,clinicId],
    ) : await queryRaw<{ total_batches: number; total_stock_value: number }>(
      `SELECT COUNT(*) as total_batches, COALESCE(SUM(quantity_remaining * purchase_price), 0) as total_stock_value
       FROM medicine_batches WHERE deleted_at IS NULL AND quantity_remaining>0 AND (is_disposed = false OR is_disposed IS NULL) AND clinic_id = ?`,
      [clinicId]
    );

    res.json({
      data: {
        total_medicines: medCount[0]?.cnt ?? 0,
        total_batches: batchStats[0]?.total_batches ?? 0,
        total_stock_value: batchStats[0]?.total_stock_value ?? 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────
// TASK 5: ADVANCED INVENTORY INTELLIGENCE ROUTES
// ──────────────────────────────────────────

import { InventoryAvailabilityService } from '../services/inventory/inventoryAvailabilityService';
import { StocktakeEngine } from '../services/inventory/stocktakeEngine';
import { InventoryReconciliationServiceV2 } from '../services/inventory/inventoryReconciliationV2';
import { InventoryClassificationEngine } from '../services/inventory/inventoryClassificationEngine';
import { ExpiryIntelligenceEngine } from '../services/inventory/expiryIntelligenceEngine';
import { ProductRecallEngine } from '../services/inventory/productRecallEngine';
import { InventoryReservationService } from '../services/inventory/inventoryReservationService';
import { ReorderEngine } from '../services/inventory/reorderEngine';
import { InventoryAlertEngine } from '../services/inventory/inventoryAlertEngine';
import { InventoryValuationService } from '../services/inventory/inventoryValuationService';
import { businessDb as localDb } from '../lib/businessDb';

// Helper to resolve org and store from auth user
function resolveOrgAndStore(req: any) {
  const orgId = req.storeContext?.organizationId || req.user?.organization_id || req.user?.clinic_id;
  const warehouseId = req.query.warehouse_id || null;
  const storeId = process.env.DATABASE_URL && warehouseId
    ? null
    : req.storeContext?.storeId || req.user?.store_id || req.query.store_id || null;
  return { orgId, storeId, warehouseId };
}

// GET /api/inventory/availability?medicine_id=&batch_id=&store_id=
inventoryRouter.get('/availability', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId, warehouseId } = resolveOrgAndStore(req);
    const medicineId = req.query.medicine_id as string;
    const batchId = (req.query.batch_id as string) || null;
    const requestedQty = Number(req.query.quantity || 0);

    if (!medicineId) {
      return res.status(400).json({ error: 'medicine_id is required' });
    }

    const locationType = warehouseId ? 'WAREHOUSE' : 'STORE';
    const result = (await InventoryAvailabilityService.getAvailability({
      organizationId: orgId,
      medicineId,
      locationType,
      storeId,
      warehouseId,
      batchId,
      requestedQuantity: requestedQty,
    }));

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/cross-location?medicine_id=
inventoryRouter.get('/cross-location', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId } = resolveOrgAndStore(req);
    const medicineId = req.query.medicine_id as string;
    if (!medicineId) {
      return res.status(400).json({ error: 'medicine_id is required' });
    }

    if (process.env.DATABASE_URL && !['OWNER','SUPER_ADMIN'].includes(req.user!.role)) {
      throw new AppError(403, 'Use the sister-store stock lookup for branches you can access.');
    }
    const result = (await InventoryAvailabilityService.getCrossLocationAvailability({
      organizationId: orgId,
      medicineId,
      currentStoreId: storeId,
    }));

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/reconciliation
inventoryRouter.get('/reconciliation', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId, warehouseId } = resolveOrgAndStore(req);
    const medicineId = (req.query.medicine_id as string) || null;

    const result = (await InventoryReconciliationServiceV2.reconcile({
      organizationId: orgId,
      storeId,
      warehouseId,
      medicineId,
    }));

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/reconciliation/repair
inventoryRouter.post('/reconciliation/repair', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { orgId, storeId, warehouseId } = resolveOrgAndStore(req);
    const { medicineId, batchId, targetPhysicalQuantity, reason } = req.body;

    const locationType = warehouseId ? 'WAREHOUSE' : 'STORE';
    const result = (await InventoryReconciliationServiceV2.repairDiscrepancy({
      organizationId: orgId,
      medicineId,
      batchId,
      locationType,
      storeId,
      warehouseId,
      targetPhysicalQuantity: Number(targetPhysicalQuantity),
      reason: reason || 'Approved Reconciliation Adjustment',
      approvedBy: req.user!.id,
    }));

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stocktakes
inventoryRouter.get('/stocktakes', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId, warehouseId } = resolveOrgAndStore(req);
    let query = `SELECT * FROM stocktake_sessions WHERE organization_id = ?`;
    const params: any[] = [orgId];
    if (process.env.DATABASE_URL && warehouseId) {
      query += ' AND warehouse_id = ?';
      params.push(warehouseId);
    } else if (storeId) {
      query += process.env.DATABASE_URL ? ' AND store_id = ?' : ' AND (store_id = ? OR store_id IS NULL)';
      params.push(storeId);
    }
    query += ` ORDER BY created_at DESC`;

    const sessions = (await localDb.prepare(query).all(...params));
    res.json({ data: sessions });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/stocktakes
inventoryRouter.post('/stocktakes', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId, warehouseId } = resolveOrgAndStore(req);
    const { name, type, scope, countingMode, isBlindCount, isDoubleCount, notes } = req.body;

    const session = (await StocktakeEngine.createSession({
      organizationId: orgId,
      storeId,
      warehouseId,
      name: name || `Stocktake ${new Date().toISOString().split('T')[0]}`,
      type,
      scope,
      countingMode,
      isBlindCount,
      isDoubleCount,
      initiatedBy: req.user!.id,
      notes,
    }));

    res.status(201).json({ data: session });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stocktakes/:id
inventoryRouter.get('/stocktakes/:id', requireAuth, async (req, res, next) => {
  try {
    const session = (await StocktakeEngine.getSession(req.params.id));
    if (!session) return res.status(404).json({ error: 'Stocktake session not found' });

    const isManager = (req.user?.role as string) === 'OWNER' || (req.user?.role as string) === 'STORE_MANAGER' || (req.user?.role as string) === 'SUPER_ADMIN';
    const items = (await StocktakeEngine.getSessionItems(req.params.id, isManager));

    res.json({ data: { session, items } });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/stocktakes/:id/start
inventoryRouter.post('/stocktakes/:id/start', requireAuth, async (req, res, next) => {
  try {
    const session = (await StocktakeEngine.startSession(req.params.id, req.user!.id));
    res.json({ data: session });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/stocktakes/:id/count
inventoryRouter.post('/stocktakes/:id/count', requireAuth, async (req, res, next) => {
  try {
    const { medicineId, batchId, counterName, scannedBarcode, rawQuantity, unitType, conversionFactor, deviceId, isOfflineSync, counterRole } = req.body;
    const result = (await StocktakeEngine.recordCount({
      stocktakeId: req.params.id,
      requestId:req.body.requestId||req.get('Idempotency-Key'),
      medicineId,
      batchId,
      counterName,
      userId: req.user!.id,
      scannedBarcode,
      rawQuantity: Number(rawQuantity ?? 1),
      unitType,
      conversionFactor: Number(conversionFactor || 1),
      deviceId,
      isOfflineSync,
      counterRole,
    }));

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/stocktakes/:id/approve
inventoryRouter.post('/stocktakes/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const session = (await StocktakeEngine.approveSession({
      sessionId: req.params.id,
      approvedBy: req.user!.id,
      userRole: req.user?.role || 'CASHIER',
      notes: req.body.notes,
    }));
    res.json({ data: session });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/stocktakes/:id/post
inventoryRouter.post('/stocktakes/:id/post', requireAuth, async (req, res, next) => {
  try {
    const result = (await StocktakeEngine.postAdjustments({
      sessionId: req.params.id,
      postedBy: req.user!.id,
      userRole: req.user?.role || 'CASHIER',
    }));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/reorder-recommendations
inventoryRouter.get('/reorder-recommendations', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId } = resolveOrgAndStore(req);
    const recommendations = (await ReorderEngine.getReorderRecommendations({
      organizationId: orgId,
      storeId,
    }));
    res.json({ data: recommendations });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/expiry-risk
inventoryRouter.get('/expiry-risk', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId } = resolveOrgAndStore(req);
    const days = parseInt(req.query.days as string) || 180;
    const result = (await ExpiryIntelligenceEngine.getExpiryRiskItems({
      organizationId: orgId,
      storeId,
      daysThreshold: days,
    }));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/ageing
inventoryRouter.get('/ageing', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId } = resolveOrgAndStore(req);
    const result = (await InventoryClassificationEngine.getAgeingAnalysis({
      organizationId: orgId,
      storeId,
    }));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/classifications
inventoryRouter.get('/classifications', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId } = resolveOrgAndStore(req);
    const result = (await InventoryClassificationEngine.computeClassifications({
      organizationId: orgId,
      storeId,
    }));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/recalls
inventoryRouter.get('/recalls', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = resolveOrgAndStore(req);
    const recalls = (await localDb
      .prepare(
        `SELECT pr.*, m.name as product_name, m.generic_name
         FROM product_recalls pr
         JOIN medicines m ON m.id = pr.product_id
         WHERE pr.organization_id = ?
         ORDER BY pr.created_at DESC`
      )
      .all(orgId));
    res.json({ data: recalls });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/recalls
inventoryRouter.post('/recalls', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { orgId } = resolveOrgAndStore(req);
    const { recallReference, recallType, productId, batchId, batchNumber, manufacturer, reason, severity } = req.body;
    const recall = (await ProductRecallEngine.createRecall({
      organizationId: orgId,
      recallReference,
      recallType,
      productId,
      batchId,
      batchNumber,
      manufacturer,
      reason,
      severity,
      createdBy: req.user!.id,
    }));
    res.status(201).json({ data: recall });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/recalls/:id
inventoryRouter.get('/recalls/:id', requireAuth, async (req, res, next) => {
  try {
    const recall = (await ProductRecallEngine.getRecall(req.params.id));
    if (!recall) return res.status(404).json({ error: 'Recall not found' });
    res.json({ data: recall });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/recalls/:id/activate
inventoryRouter.post('/recalls/:id/activate', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const recall = (await ProductRecallEngine.activateRecall(req.params.id, req.user!.id));
    res.json({ data: recall });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/recalls/tasks/:taskId/complete
inventoryRouter.post('/recalls/tasks/:taskId/complete', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId } = resolveOrgAndStore(req);
    const task = await localDb.prepare(
      'SELECT id,store_id,warehouse_id FROM recall_tasks WHERE CAST(id AS TEXT)=? AND organization_id=?',
    ).get(req.params.taskId,orgId);
    if (!task) throw new AppError(404, 'Recall task not found.');
    if (process.env.DATABASE_URL) {
      const allowed = task.warehouse_id
        ? await LocationService.validateUserAccess(req.user!.id,'WAREHOUSE',task.warehouse_id,orgId)
        : task.store_id === storeId || req.storeContext?.isOrgAdmin;
      if (!allowed) throw new AppError(403, 'Access to the recall task location is required.');
    }
    const { quarantinedUnits, notes } = req.body;
    const completed = (await ProductRecallEngine.completeTask({
      taskId: req.params.taskId,
      quarantinedUnits: Number(quarantinedUnits || 0),
      completedBy: req.user!.id,
      notes,
    }));
    res.json({ data: completed });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/recalls/:id/trace/sales
inventoryRouter.get('/recalls/:id/trace/sales', requireAuth, requireRole('OWNER','PHARMACIST','SUPER_ADMIN'), async (req, res, next) => {
  try {
    const recall = (await ProductRecallEngine.getRecall(req.params.id));
    if (!recall) return res.status(404).json({ error: 'Recall not found' });

    const trace = (await ProductRecallEngine.traceHistoricalSales({
      organizationId: recall.organization_id,
      productId: recall.product_id,
      batchId: recall.batch_id,
      storeId: process.env.DATABASE_URL && req.user!.role === 'PHARMACIST' ? req.storeContext?.storeId : undefined,
    }));
    res.json({ data: trace });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/recalls/:id/trace/prescriptions
inventoryRouter.get('/recalls/:id/trace/prescriptions', requireAuth, requireRole('OWNER','PHARMACIST','SUPER_ADMIN'), async (req, res, next) => {
  try {
    const recall = (await ProductRecallEngine.getRecall(req.params.id));
    if (!recall) return res.status(404).json({ error: 'Recall not found' });

    const trace = (await ProductRecallEngine.tracePrescriptionDispensing({
      organizationId: recall.organization_id,
      productId: recall.product_id,
      batchId: recall.batch_id,
      storeId: process.env.DATABASE_URL && req.user!.role === 'PHARMACIST' ? req.storeContext?.storeId : undefined,
    }));
    res.json({ data: trace });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/reservations
inventoryRouter.post('/reservations', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId, warehouseId } = resolveOrgAndStore(req);
    const { medicineId, batchId, quantity, sourceType, sourceId, durationMinutes } = req.body;

    const locationType = warehouseId ? 'WAREHOUSE' : 'STORE';
    const reservation = (await InventoryReservationService.createReservation({
      organizationId: orgId,
      locationType,
      storeId,
      warehouseId,
      medicineId,
      batchId,
      quantity: Number(quantity),
      sourceType: sourceType || 'MANUAL',
      sourceId: sourceId || 'MANUAL-RES',
      durationMinutes: Number(durationMinutes || 60),
      createdBy: req.user!.id,
    }));

    res.status(201).json({ data: reservation });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inventory/reservations/:id
inventoryRouter.delete('/reservations/:id', requireAuth, async (req, res, next) => {
  try {
    (await InventoryReservationService.releaseReservation(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/alerts
inventoryRouter.get('/alerts', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId } = resolveOrgAndStore(req);
    const alerts = (await InventoryAlertEngine.listAlerts({
      organizationId: orgId,
      storeId,
    }));
    res.json({ data: alerts });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/inventory/alerts/:id
inventoryRouter.patch('/alerts/:id', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const alert = (await InventoryAlertEngine.updateAlertStatus({
      alertId: req.params.id,
      status: status || 'ACKNOWLEDGED',
      acknowledgedBy: req.user!.id,
    }));
    res.json({ data: alert });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/valuation
inventoryRouter.get('/valuation', requireAuth, async (req, res, next) => {
  try {
    const { orgId, storeId, warehouseId } = resolveOrgAndStore(req);
    const valuation = (await InventoryValuationService.getValuation({
      organizationId: orgId,
      storeId,
      warehouseId,
    }));
    res.json({ data: valuation });
  } catch (err) {
    next(err);
  }
});

export default inventoryRouter;
import { resolveCloudStoreContext } from '../services/cloudStoreContext';
