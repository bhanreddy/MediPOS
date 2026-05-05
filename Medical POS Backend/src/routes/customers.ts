import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createCustomerSchema,
  updateCustomerSchema,
  recordPaymentSchema,
  createRefillReminderSchema,
} from '../schemas/customer.schema';
import { localMutate } from '../lib/localMutate';
import { queryAll, queryOne, queryRaw } from '../lib/localQuery';

export const customersRouter = Router();

// GET /api/customers
customersRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const q = req.query.q as string;

    const conditions: string[] = [];
    const values: any[] = [];
    if (q) { conditions.push('name LIKE ?'); values.push(`%${q}%`); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const all = queryAll('customers', where, values);

    all.sort((a: any, b: any) => Number(b.importance_score ?? 0) - Number(a.importance_score ?? 0));

    const offset = (page - 1) * limit;
    const data = all.slice(offset, offset + limit);

    res.json({
      data,
      pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id
customersRouter.get('/:id', requireAuth, (req, res, next) => {
  if (req.params.id === 'reminders') return next();

  try {
    const customer = queryOne('customers', '_local_id=? OR id=?', [req.params.id, req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const custId = (customer as any)._local_id || (customer as any).id;
    const sales = queryAll('sales', 'customer_id=?', [custId]);
    sales.sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    const recent_sales = sales.slice(0, 10);

    res.json({ data: { ...customer, recent_sales } });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers
customersRouter.post('/', requireAuth, requireRole('PHARMACIST', 'OWNER'), (req, res, next) => {
  try {
    const parsed = createCustomerSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = localMutate({ table: 'customers', operation: 'INSERT', data: payload });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id
customersRouter.put('/:id', requireAuth, requireRole('PHARMACIST', 'OWNER'), (req, res, next) => {
  try {
    const parsed = updateCustomerSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = localMutate({ table: 'customers', operation: 'UPDATE', data: { ...payload, _local_id: req.params.id } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id
customersRouter.delete('/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const data = localMutate({ table: 'customers', operation: 'DELETE', data: { _local_id: req.params.id } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/outstanding
customersRouter.get('/:id/outstanding', requireAuth, (req, res, next) => {
  try {
    const customer = queryOne('customers', '_local_id=? OR id=?', [req.params.id, req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const custId = (customer as any)._local_id || (customer as any).id;
    const creditSales = queryAll('sales', "customer_id=? AND payment_status IN ('credit','partial')", [custId]);

    res.json({ data: { outstanding_balance: (customer as any).outstanding_balance, credit_sales: creditSales } });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/:id/payment
customersRouter.post('/:id/payment', requireAuth, (req, res, next) => {
  try {
    const parsed = recordPaymentSchema.parse(req.body);

    const data = localMutate({
      table: 'customers',
      operation: 'UPDATE',
      data: { payment_amount: parsed.amount, payment_mode: parsed.payment_mode, _local_id: req.params.id }
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/reminders
customersRouter.post(
  '/reminders',
  requireAuth,
  requireRole('PHARMACIST', 'OWNER'),
  (req, res, next) => {
    try {
      const parsed = createRefillReminderSchema.parse(req.body);
      const clinicId = req.user!.clinic_id!;

      const data = localMutate({
        table: 'refill_reminders',
        operation: 'INSERT',
        data: {
          clinic_id: clinicId,
          customer_id: parsed.customer_id,
          medicine_name: parsed.medicine_name,
          remind_on: parsed.reminder_date,
        }
      });

      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/customers/reminders/due
customersRouter.get('/reminders/due', requireAuth, (req, res, next) => {
  try {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 3);
    const thresholdStr = threshold.toISOString().split('T')[0];

    const data = queryAll('refill_reminders', 'is_sent=0 AND remind_on<=?', [thresholdStr]);

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/customers/reminders/:id/sent
customersRouter.patch('/reminders/:id/sent', requireAuth, (req, res, next) => {
  try {
    const data = localMutate({
      table: 'refill_reminders',
      operation: 'UPDATE',
      data: { is_sent: true, sent_at: new Date().toISOString(), _local_id: req.params.id }
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default customersRouter;
