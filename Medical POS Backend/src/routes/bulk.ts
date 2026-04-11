import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { auditLog } from '../services/auditLog';
import { restockBatch } from '../services/stockLedger';
import { AppError } from '../lib/appError';

export const bulkRouter = Router();

bulkRouter.use(requireAuth);
bulkRouter.use(requireRole('OWNER'));

const medicineRowSchema = z.object({
  name: z.string().min(1),
  generic_name: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  category: z.enum(['tablet', 'syrup', 'injection', 'capsule', 'cream', 'drops', 'other']).default('tablet'),
  hsn_code: z.string().optional().nullable(),
  gst_rate: z.number().refine((v) => [0, 5, 12, 18].includes(v)).default(0),
  unit: z.string().default('strip'),
  is_schedule_h1: z.boolean().default(false),
  low_stock_threshold: z.number().int().positive().default(10),
  barcode: z.string().optional().nullable(),
});

const customerRowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

const openingStockRowSchema = z.object({
  medicine_name: z.string().min(1),
  batch_number: z.string().min(1),
  expiry_date: z.string(),
  quantity: z.number().int().positive(),
  mrp: z.number().positive(),
  purchase_price: z.number().positive(),
  generic_name: z.string().optional().nullable(),
  gst_rate: z.number().refine((v) => [0, 5, 12, 18].includes(v)).default(0),
});

bulkRouter.post('/medicines', async (req, res, next) => {
  try {
    const rows = z.array(medicineRowSchema).min(1).max(5000).parse(req.body.medicines ?? req.body);
    const clinicId = req.user!.clinic_id!;
    const errors: Array<{ index: number; message: string }> = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { error } = await supabaseAdmin.from('medicines').insert({
        ...row,
        clinic_id: clinicId,
        is_active: true,
      });
      if (error) {
        errors.push({ index: i, message: error.message });
      } else {
        success += 1;
      }
    }

    await auditLog({
      clinicId,
      userId: req.user!.id,
      action: 'BULK_IMPORT',
      table: 'medicines',
      newData: { success, failed: errors.length },
    });

    res.status(201).json({ success, failed: errors.length, errors });
  } catch (err) {
    next(err);
  }
});

bulkRouter.post('/customers', async (req, res, next) => {
  try {
    const rows = z.array(customerRowSchema).min(1).max(10000).parse(req.body.customers ?? req.body);
    const clinicId = req.user!.clinic_id!;
    const errors: Array<{ index: number; message: string }> = [];
    let success = 0;

    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('phone')
      .eq('clinic_id', clinicId);

    const phones = new Set((existing || []).map((c) => c.phone).filter(Boolean));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (phones.has(row.phone)) {
        errors.push({ index: i, message: 'Duplicate phone' });
        continue;
      }
      const { error } = await supabaseAdmin.from('customers').insert({
        clinic_id: clinicId,
        name: row.name,
        phone: row.phone,
        email: row.email || null,
        address: row.address || null,
      });
      if (error) {
        errors.push({ index: i, message: error.message });
      } else {
        phones.add(row.phone);
        success += 1;
      }
    }

    await auditLog({
      clinicId,
      userId: req.user!.id,
      action: 'BULK_IMPORT',
      table: 'customers',
      newData: { success, failed: errors.length },
    });

    res.status(201).json({ success, failed: errors.length, errors });
  } catch (err) {
    next(err);
  }
});

bulkRouter.post('/inventory', async (req, res, next) => {
  try {
    const rows = z.array(openingStockRowSchema).min(1).max(2000).parse(req.body.lines ?? req.body);
    const clinicId = req.user!.clinic_id!;
    const errors: Array<{ index: number; message: string }> = [];
    let success = 0;

    const { data: purchase, error: pErr } = await supabaseAdmin
      .from('purchases')
      .insert({
        clinic_id: clinicId,
        invoice_number: `OPENING-${Date.now()}`,
        invoice_date: new Date().toISOString().split('T')[0],
        net_amount: 0,
        subtotal: 0,
        payment_status: 'paid',
        paid_amount: 0,
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (pErr || !purchase) {
      throw pErr || new AppError(500, 'Could not create opening purchase header');
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let { data: med } = await supabaseAdmin
          .from('medicines')
          .select('id')
          .eq('clinic_id', clinicId)
          .ilike('name', row.medicine_name)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!med) {
          const ins = await supabaseAdmin
            .from('medicines')
            .insert({
              clinic_id: clinicId,
              name: row.medicine_name,
              generic_name: row.generic_name || null,
              category: 'tablet',
              gst_rate: row.gst_rate,
              is_active: true,
            })
            .select('id')
            .single();
          if (ins.error) throw ins.error;
          med = ins.data;
        }

        await restockBatch(
          {
            medicine_id: med!.id,
            purchase_id: purchase.id,
            batch_number: row.batch_number,
            expiry_date: row.expiry_date,
            quantity: row.quantity,
            purchase_price: row.purchase_price,
            mrp: row.mrp,
          },
          clinicId,
          supabaseAdmin
        );
        success += 1;
      } catch (e: any) {
        errors.push({ index: i, message: e.message || 'Failed' });
      }
    }

    await auditLog({
      clinicId,
      userId: req.user!.id,
      action: 'BULK_IMPORT',
      table: 'medicine_batches',
      newData: { success, failed: errors.length, purchase_id: purchase.id },
    });

    res.status(201).json({ success, failed: errors.length, errors, purchase_id: purchase.id });
  } catch (err) {
    next(err);
  }
});
