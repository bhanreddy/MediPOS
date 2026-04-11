import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { auditLog } from '../services/auditLog';

export const clinicsRouter = Router();

// GET /api/clinics/me
clinicsRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('clinics')
      .select('*')
      .eq('id', req.user!.clinic_id!)
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/clinics/me
clinicsRouter.put('/me', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { name, address, phone, email, gstin, drug_licence_number, logo_url, signature_url, invoice_footer } = req.body;
    
    // Only allow specific fields to be updated
    const payload = {
      name, address, phone, email, gstin, drug_licence_number, logo_url, signature_url, invoice_footer
    };

    // Remove undefined values
    Object.keys(payload).forEach(key => payload[key as keyof typeof payload] === undefined && delete payload[key as keyof typeof payload]);

    const { data, error } = await supabaseAdmin
      .from('clinics')
      .update(payload)
      .eq('id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'UPDATE', table: 'clinics', newData: data, recordId: req.user!.clinic_id! });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});
