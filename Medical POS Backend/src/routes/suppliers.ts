import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { 
  createSupplierSchema, 
  updateSupplierSchema 
} from '../schemas/supplier.schema';
import { auditLog } from '../services/auditLog';

export const suppliersRouter = Router();

// GET /api/suppliers
suppliersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const q = req.query.q as string;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('suppliers')
      .select('*', { count: 'exact' })
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .range(offset, offset + limit - 1)
      .order('name', { ascending: true });

    if (q) {
      query = query.ilike('name', `%${q}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      data,
      pagination: { 
        page, 
        limit, 
        total: count || 0, 
        totalPages: Math.ceil((count || 0) / limit) 
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id
suppliersRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .select('*')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers
suppliersRouter.post('/', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = createSupplierSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'CREATE', 
      table: 'suppliers', 
      newData: data 
    });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/suppliers/:id
suppliersRouter.put('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = updateSupplierSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const { data, error } = await supabaseAdmin
      .from('suppliers')
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
      table: 'suppliers', 
      newData: data,
      recordId: req.params.id
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/suppliers/:id
suppliersRouter.delete('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('suppliers')
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
      table: 'suppliers', 
      newData: data,
      recordId: req.params.id
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id/outstanding
suppliersRouter.get('/:id/outstanding', requireAuth, async (req, res, next) => {
  try {
    const { data: supplier, error: suppErr } = await supabaseAdmin
      .from('suppliers')
      .select('outstanding_balance')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (suppErr) throw suppErr;

    const { data: purchases, error: purchErr } = await supabaseAdmin
      .from('purchases')
      .select('id, invoice_number, invoice_date, net_amount, payment_status, paid_amount')
      .eq('supplier_id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .order('invoice_date', { ascending: false })
      .limit(10);

    if (purchErr) throw purchErr;

    res.json({ data: { outstanding_balance: supplier.outstanding_balance, purchases } });
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers/:id/payment
suppliersRouter.post('/:id/payment', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const amountStr = req.body.amount;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount required' });
    }

    const { data: supplier, error: suppErr } = await supabaseAdmin
      .from('suppliers')
      .select('outstanding_balance')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (suppErr || !supplier) throw suppErr || new Error('Supplier not found');

    const newOutstanding = Number(supplier.outstanding_balance) - amount;

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .update({ outstanding_balance: newOutstanding })
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'PAYMENT', 
      table: 'suppliers', 
      newData: { payment_amount: amount, new_balance: newOutstanding },
      oldData: { balance: supplier.outstanding_balance },
      recordId: req.params.id
    });

    // Option to record in unified ledger / accounting later
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default suppliersRouter;
