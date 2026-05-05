import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createExpenseSchema, updateExpenseSchema } from '../schemas/expense.schema';
import { localMutate } from '../lib/localMutate';
import { queryAll, queryRaw } from '../lib/localQuery';

export const expensesRouter = Router();

// GET /api/expenses/summary
expensesRouter.get('/summary', requireAuth, (req, res, next) => {
  try {
    const from = req.query.from as string;
    const to = req.query.to as string;

    const conditions = ['_deleted=0'];
    const values: any[] = [];
    if (from) { conditions.push('expense_date>=?'); values.push(from); }
    if (to) { conditions.push('expense_date<=?'); values.push(to); }

    const rows = queryRaw<{ category: string; total: number; cnt: number }>(
      `SELECT category, SUM(amount) as total, COUNT(*) as cnt FROM expenses WHERE ${conditions.join(' AND ')} GROUP BY category`,
      values
    );

    const grand_total = rows.reduce((a, r) => a + Number(r.total), 0);

    res.json({ data: { summary: rows.map(r => ({ category: r.category, total: Number(r.total), count: Number(r.cnt) })), grand_total } });
  } catch (err) {
    next(err);
  }
});

// GET /api/expenses
expensesRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const conditions: string[] = [];
    const values: any[] = [];
    if (req.query.category) { conditions.push('category=?'); values.push(req.query.category); }
    if (req.query.from) { conditions.push('expense_date>=?'); values.push(req.query.from); }
    if (req.query.to) { conditions.push('expense_date<=?'); values.push(req.query.to); }
    if (req.query.payment_mode) { conditions.push('payment_mode=?'); values.push(req.query.payment_mode); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const all = queryAll('expenses', where, values);

    // Sort by date descending
    all.sort((a: any, b: any) => String(b.expense_date ?? '').localeCompare(String(a.expense_date ?? '')));

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

// POST /api/expenses
expensesRouter.post('/', requireAuth, requireRole('OWNER', 'PHARMACIST'), (req, res, next) => {
  try {
    const parsed = createExpenseSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id!, recorded_by: req.user!.id };

    const data = localMutate({ table: 'expenses', operation: 'INSERT', data: payload });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/expenses/:id
expensesRouter.put('/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const parsed = updateExpenseSchema.parse(req.body);

    const data = localMutate({ table: 'expenses', operation: 'UPDATE', data: { ...parsed, _local_id: req.params.id } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/expenses/:id
expensesRouter.delete('/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    localMutate({ table: 'expenses', operation: 'DELETE', data: { _local_id: req.params.id } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default expensesRouter;
