import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { 
  createSupplierSchema, 
  updateSupplierSchema 
} from '../schemas/supplier.schema';
import { localMutate } from '../lib/localMutate';
import { queryAll, queryOne } from '../lib/localQuery';

export const suppliersRouter = Router();

// GET /api/suppliers
suppliersRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const q = req.query.q as string;

    const conditions: string[] = [];
    const values: any[] = [];
    if (q) { conditions.push('name LIKE ?'); values.push(`%${q}%`); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const all = queryAll('suppliers', where, values);

    all.sort((a: any, b: any) => String(a.name ?? '').localeCompare(String(b.name ?? '')));

    const offset = (page - 1) * limit;
    const data = all.slice(offset, offset + limit);

    res.json({
      data,
      pagination: { 
        page, 
        limit, 
        total: all.length, 
        totalPages: Math.ceil(all.length / limit) 
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id
suppliersRouter.get('/:id', requireAuth, (req, res, next) => {
  try {
    const data = queryOne('suppliers', '_local_id=? OR id=?', [req.params.id, req.params.id]);
    if (!data) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers
suppliersRouter.post('/', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const parsed = createSupplierSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = localMutate({ table: 'suppliers', operation: 'INSERT', data: payload });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/suppliers/:id
suppliersRouter.put('/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const parsed = updateSupplierSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = localMutate({ table: 'suppliers', operation: 'UPDATE', data: { ...payload, _local_id: req.params.id } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/suppliers/:id
suppliersRouter.delete('/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const data = localMutate({ table: 'suppliers', operation: 'DELETE', data: { _local_id: req.params.id } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id/outstanding
suppliersRouter.get('/:id/outstanding', requireAuth, (req, res, next) => {
  try {
    const supplier = queryOne('suppliers', '_local_id=? OR id=?', [req.params.id, req.params.id]);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const suppId = (supplier as any)._local_id || (supplier as any).id;
    const purchases = queryAll('purchases', "supplier_id=? AND payment_status!='paid'", [suppId]);
    purchases.sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

    res.json({ data: { outstanding_balance: (supplier as any).outstanding_balance, purchases: purchases.slice(0, 10) } });
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers/:id/payment
suppliersRouter.post('/:id/payment', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const amountStr = req.body.amount;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount required' });
    }

    const data = localMutate({
      table: 'suppliers',
      operation: 'UPDATE',
      data: { payment_amount: amount, _local_id: req.params.id }
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default suppliersRouter;
