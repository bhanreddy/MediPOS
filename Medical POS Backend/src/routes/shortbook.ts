import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { addToShortbookSchema } from '../schemas/shortbook.schema';
import { auditLog } from '../services/auditLog';

export const shortbookRouter = Router();

// GET /api/shortbook
shortbookRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shortbook')
      .select('*, medicines(name, generic_name, medicine_stock(total_stock))')
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_ordered', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/shortbook
shortbookRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = addToShortbookSchema.parse(req.body);

    const { data: existing } = await supabaseAdmin
      .from('shortbook')
      .select('id')
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('medicine_id', parsed.medicine_id)
      .eq('is_ordered', false)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Item already exists in shortbook and is not ordered' });
    }

    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const { data, error } = await supabaseAdmin
      .from('shortbook')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'CREATE', table: 'shortbook', newData: data });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/shortbook/:id/ordered
shortbookRouter.patch('/:id/ordered', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shortbook')
      .update({ is_ordered: true, ordered_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'UPDATE', table: 'shortbook', newData: data, recordId: req.params.id });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shortbook/:id
shortbookRouter.delete('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('shortbook')
      .delete()
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!);

    if (error) throw error;

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'DELETE', table: 'shortbook', recordId: req.params.id });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default shortbookRouter;
