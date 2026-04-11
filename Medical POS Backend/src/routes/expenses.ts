import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { createExpenseSchema, updateExpenseSchema } from '../schemas/expense.schema';
import { auditLog } from '../services/auditLog';

export const expensesRouter = Router();

// GET /api/expenses/summary
expensesRouter.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const from = req.query.from as string;
    const to = req.query.to as string;

    let query = supabaseAdmin
      .from('expenses')
      .select('category, amount')
      .eq('clinic_id', req.user!.clinic_id!);

    if (from) query = query.gte('expense_date', from);
    if (to) query = query.lte('expense_date', to);

    const { data, error } = await query;
    if (error) throw error;

    const grouped: Record<string, { category: string, total: number, count: number }> = {};
    let grand_total = 0;

    data?.forEach(e => {
      if (!grouped[e.category]) {
        grouped[e.category] = { category: e.category, total: 0, count: 0 };
      }
      grouped[e.category].total += Number(e.amount);
      grouped[e.category].count += 1;
      grand_total += Number(e.amount);
    });

    res.json({ data: { summary: Object.values(grouped), grand_total } });
  } catch (err) {
    next(err);
  }
});

// GET /api/expenses
expensesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('expenses')
      .select('*', { count: 'exact' })
      .eq('clinic_id', req.user!.clinic_id!)
      .range(offset, offset + limit - 1)
      .order('expense_date', { ascending: false });

    if (req.query.category) query = query.eq('category', req.query.category);
    if (req.query.from) query = query.gte('expense_date', req.query.from);
    if (req.query.to) query = query.lte('expense_date', req.query.to);
    if (req.query.payment_mode) query = query.eq('payment_mode', req.query.payment_mode);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses
expensesRouter.post('/', requireAuth, requireRole('OWNER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const parsed = createExpenseSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id!, recorded_by: req.user!.id };

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'CREATE', table: 'expenses', newData: data });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/expenses/:id
expensesRouter.put('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = updateExpenseSchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(parsed)
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'UPDATE', table: 'expenses', newData: data, recordId: req.params.id });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/expenses/:id
expensesRouter.delete('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!);

    if (error) throw error;

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'DELETE', table: 'expenses', recordId: req.params.id });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default expensesRouter;
