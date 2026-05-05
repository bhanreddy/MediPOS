import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { localMutate } from '../lib/localMutate';
import { queryOne } from '../lib/localQuery';

export const clinicsRouter = Router();

// GET /api/clinics/me
clinicsRouter.get('/me', requireAuth, (req, res, next) => {
  try {
    // Try fetching from local clinics table
    let profileData = queryOne('clinics', '1=1') as any;

    if (!profileData) {
      // Fallback: Return a temporary store if no record found
      profileData = {
        id: req.user?.clinic_id || 'temp-id',
        name: req.user?.role === 'SUPER_ADMIN' ? 'Super Admin Dashboard' : 'My Medical Store',
        owner_name: req.user?.email || 'Store Owner',
        gstin: 'Not configured',
        drug_licence_number: 'Not configured',
        address: 'Not configured',
        phone: 'Not configured',
        email: req.user?.email || 'Not configured',
        is_active: true,
        logo_url: null
      };
    }

    res.json({ data: profileData });
  } catch (err) {
    next(err);
  }
});

// PUT /api/clinics/me
clinicsRouter.put('/me', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const { name, address, phone, email, gstin, drug_licence_number, logo_url, signature_url, invoice_footer } = req.body;
    
    // Only allow specific fields to be updated
    const payload: Record<string, any> = {
      name, address, phone, email, gstin, drug_licence_number, logo_url, signature_url, invoice_footer
    };

    // Remove undefined values
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const data = localMutate({ table: 'clinics', operation: 'UPDATE', data: { ...payload, _local_id: req.user!.clinic_id! } });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});
