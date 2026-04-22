import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import {
  createCustomerSchema,
  updateCustomerSchema,
  recordPaymentSchema,
  createRefillReminderSchema,
} from '../schemas/customer.schema';
import { auditLog } from '../services/auditLog';

export const customersRouter = Router();

// GET /api/customers
customersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const q = req.query.q as string;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .range(offset, offset + limit - 1)
      .order('importance_score', { ascending: false });

    if (q) {
      query = query.ilike('name', `%${q}%`);
    }

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

// GET /api/customers/:id
customersRouter.get('/:id', requireAuth, async (req, res, next) => {
  // Excluding the specific nested reminder path from matching this route inappropriately via express router order
  if (req.params.id === 'reminders') return next();

  try {
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .single();

    if (custErr) throw custErr;

    const { data: sales } = await supabaseAdmin
      .from('sales')
      .select('id, invoice_number, sale_date, net_amount, payment_status, balance_due')
      .eq('customer_id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .order('sale_date', { ascending: false })
      .limit(10);

    res.json({ data: { ...customer, recent_sales: sales || [] } });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers
customersRouter.post('/', requireAuth, requireRole('PHARMACIST', 'OWNER'), async (req, res, next) => {
  try {
    const parsed = createCustomerSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'CREATE', 
      table: 'customers', 
      newData: data 
    });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id
customersRouter.put('/:id', requireAuth, requireRole('PHARMACIST', 'OWNER'), async (req, res, next) => {
  try {
    const parsed = updateCustomerSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(payload)
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'UPDATE', 
      table: 'customers', 
      newData: data,
      recordId: req.params.id
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id
customersRouter.delete('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'DELETE', 
      table: 'customers', 
      newData: data,
      recordId: req.params.id
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/outstanding
customersRouter.get('/:id/outstanding', requireAuth, async (req, res, next) => {
  try {
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('outstanding_balance')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (custErr) throw custErr;

    const { data: creditSales } = await supabaseAdmin
      .from('sales')
      .select('*')
      .eq('customer_id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('payment_status', 'credit')
      .order('sale_date', { ascending: false });

    res.json({ data: { outstanding_balance: customer.outstanding_balance, credit_sales: creditSales || [] } });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/:id/payment
customersRouter.post('/:id/payment', requireAuth, async (req, res, next) => {
  try {
    const parsed = recordPaymentSchema.parse(req.body);

    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('outstanding_balance')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (custErr || !customer) throw custErr || new Error('Customer not found');

    if (parsed.amount > Number(customer.outstanding_balance)) {
      return res.status(400).json({ error: 'Payment amount exceeds outstanding balance' });
    }

    const newOutstanding = Number(customer.outstanding_balance) - parsed.amount;

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ outstanding_balance: newOutstanding })
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'PAYMENT_RECEIVED', 
      table: 'customers', 
      newData: { payment_amount: parsed.amount, new_balance: newOutstanding, mode: parsed.payment_mode },
      oldData: { balance: customer.outstanding_balance },
      recordId: req.params.id
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
  async (req, res, next) => {
    try {
      const parsed = createRefillReminderSchema.parse(req.body);
      const clinicId = req.user!.clinic_id!;

      const { data: cust, error: custErr } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('id', parsed.customer_id)
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .maybeSingle();

      if (custErr) throw custErr;
      if (!cust) return res.status(404).json({ error: 'Customer not found' });

      const needle = `%${parsed.medicine_name.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

      const { data: meds, error: medErr } = await supabaseAdmin
        .from('medicines')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .ilike('name', needle)
        .limit(2);

      if (medErr) throw medErr;

      if (!meds?.length) {
        return res.status(404).json({ error: 'Medicine not found', detail: parsed.medicine_name });
      }
      if (meds.length > 1) {
        return res.status(409).json({
          error: 'Ambiguous medicine name — pick a medicine_id or narrow the search',
          matches: meds.map((m) => m.id),
        });
      }

      const medicineId = meds[0].id;

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('refill_reminders')
        .insert({
          clinic_id: clinicId,
          customer_id: parsed.customer_id,
          medicine_id: medicineId,
          remind_on: parsed.reminder_date,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      await auditLog({
        clinicId,
        userId: req.user!.id,
        action: 'CREATE',
        table: 'refill_reminders',
        newData: inserted,
      });

      res.status(201).json({ data: inserted });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/customers/reminders/due
customersRouter.get('/reminders/due', requireAuth, async (req, res, next) => {
  try {
    const today = new Date();
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() + 3);
    const thresholdStr = threshold.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('refill_reminders')
      .select(`
        id, remind_on, is_sent, sent_at,
        customers(name, phone),
        medicines(name)
      `)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_sent', false)
      .lte('remind_on', thresholdStr)
      .order('remind_on', { ascending: true });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/customers/reminders/:id/sent
customersRouter.patch('/reminders/:id/sent', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('refill_reminders')
      .update({ is_sent: true, sent_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default customersRouter;
