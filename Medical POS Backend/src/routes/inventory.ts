import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createMedicineSchema, updateMedicineSchema } from '../schemas/medicine.schema';
import { localMutate } from '../lib/localMutate';
import { queryAll, queryOne, queryRaw } from '../lib/localQuery';

export const inventoryRouter = Router();

// GET /api/inventory/medicines/search?q=&barcode=
inventoryRouter.get('/medicines/search', requireAuth, (req, res, next) => {
  try {
    const q = (req.query.q as string) || '';
    const barcode = (req.query.barcode as string) || '';

    let results: any[] = [];

    if (barcode) {
      results = queryAll('medicines', 'barcode=? AND is_active=1', [barcode]);
    } else if (q) {
      results = queryAll('medicines', '(name LIKE ? OR generic_name LIKE ?) AND is_active=1', [`%${q}%`, `%${q}%`]);
    } else {
      return res.json({ results: [], substitutes: [] });
    }

    // Attach batches to each result
    for (const med of results) {
      const batches = queryAll('medicine_batches', 'medicine_id=? AND quantity_remaining>0', [med._local_id]);
      med.medicine_batches = batches;
      med.total_stock = batches.reduce((s: number, b: any) => s + Number(b.quantity_remaining ?? 0), 0);
    }

    // Find substitutes by generic name
    let substitutes: any[] = [];
    const genericNames = results.map((r: any) => r.generic_name).filter(Boolean);
    if (genericNames.length > 0) {
      const resultIds = results.map((r: any) => r._local_id);
      const placeholders = genericNames.map(() => '?').join(',');
      const allGeneric = queryRaw(
        `SELECT * FROM medicines WHERE _deleted=0 AND is_active=1 AND generic_name IN (${placeholders})`,
        genericNames
      );
      substitutes = (allGeneric as any[]).filter(s => !resultIds.includes(s._local_id));
    }

    res.json({ results, substitutes });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/medicines
inventoryRouter.get('/medicines', requireAuth, (req, res, next) => {
  try {
    const q = req.query.q as string;
    const category = req.query.category as string;
    const lowStock = req.query.low_stock === 'true';
    const scheduleH1 = req.query.schedule_h1 === 'true';

    const conditions: string[] = ['is_active=1'];
    const values: any[] = [];

    if (q) { conditions.push('(name LIKE ? OR generic_name LIKE ?)'); values.push(`%${q}%`, `%${q}%`); }
    if (category) { conditions.push('category=?'); values.push(category); }
    if (scheduleH1) { conditions.push('is_schedule_h1=1'); }

    const where = conditions.join(' AND ');
    let data = queryAll('medicines', where, values);

    // Attach stock totals
    for (const med of data) {
      const batches = queryAll('medicine_batches', 'medicine_id=?', [(med as any)._local_id]);
      (med as any).total_stock = batches.reduce((s: number, b: any) => s + Number(b.quantity_remaining ?? 0), 0);
    }

    if (lowStock) {
      data = data.filter((d: any) => (d.total_stock ?? 0) <= (d.low_stock_threshold ?? 10));
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/medicines/:id
inventoryRouter.get('/medicines/:id', requireAuth, (req, res, next) => {
  try {
    const medicine = queryOne('medicines', '(_local_id=? OR id=?) AND is_active=1', [req.params.id, req.params.id]);
    if (!medicine) {
      return res.status(404).json({ error: { message: 'Medicine not found', code: 'NOT_FOUND' } });
    }

    const medId = (medicine as any)._local_id;
    const batches = queryAll('medicine_batches', 'medicine_id=?', [medId]);
    batches.sort((a: any, b: any) => String(a.expiry_date ?? '').localeCompare(String(b.expiry_date ?? '')));

    res.json({ data: { ...medicine, batches } });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/medicines
inventoryRouter.post('/medicines', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const parsed = createMedicineSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = localMutate({ table: 'medicines', operation: 'INSERT', data: payload });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/medicines/:id
inventoryRouter.put('/medicines/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const parsed = updateMedicineSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = localMutate({ table: 'medicines', operation: 'UPDATE', data: { ...payload, _local_id: req.params.id } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inventory/medicines/:id
inventoryRouter.delete('/medicines/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const data = localMutate({ table: 'medicines', operation: 'DELETE', data: { _local_id: req.params.id } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/batches
inventoryRouter.get('/batches', requireAuth, (req, res, next) => {
  try {
    const medicineId = req.query.medicine_id as string;
    if (!medicineId) {
      return res.status(400).json({ error: 'medicine_id is required' });
    }

    const data = queryAll('medicine_batches', 'medicine_id=?', [medicineId]);
    data.sort((a: any, b: any) => String(a.expiry_date ?? '').localeCompare(String(b.expiry_date ?? '')));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/batches/expiring
inventoryRouter.get('/batches/expiring', requireAuth, (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + days);
    const maxStr = maxDate.toISOString().split('T')[0];

    const data = queryAll('medicine_batches', 'quantity_remaining>0 AND expiry_date<=?', [maxStr]);
    data.sort((a: any, b: any) => String(a.expiry_date ?? '').localeCompare(String(b.expiry_date ?? '')));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stock/low
inventoryRouter.get('/stock/low', requireAuth, (req, res, next) => {
  try {
    const data = queryRaw(
      `SELECT m.*, COALESCE(SUM(mb.quantity_remaining), 0) as total_stock
       FROM medicines m
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m._local_id AND mb._deleted=0
       WHERE m._deleted=0 AND m.is_active=1
       GROUP BY m._local_id
       HAVING total_stock <= m.low_stock_threshold`
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stock/summary
inventoryRouter.get('/stock/summary', requireAuth, (req, res, next) => {
  try {
    const medCount = queryRaw<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM medicines WHERE _deleted=0 AND is_active=1`
    );

    const batchStats = queryRaw<{ total_batches: number; total_stock_value: number }>(
      `SELECT COUNT(*) as total_batches, COALESCE(SUM(quantity_remaining * purchase_price), 0) as total_stock_value
       FROM medicine_batches WHERE _deleted=0 AND quantity_remaining>0`
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

export default inventoryRouter;
