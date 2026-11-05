import { localMutate, queryAll, queryRaw, withPostgresTransaction } from '../lib/postgresDb';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError } from '../lib/appError';
import { importMedicines } from '../services/medicineImport';
import { dateOnlySchema } from '../schemas/date.schema';
import { importIdentity } from '../lib/importIdentity';


export const bulkRouter = Router();

bulkRouter.use(requireAuth);
bulkRouter.use(requireRole('OWNER'));
bulkRouter.use((req, _res, next) => {
  if (!req.user?.clinic_id) return next(new AppError(403, 'Clinic context required', 'NO_CLINIC'));
  next();
});

const customerRowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

const openingStockRowSchema = z.object({
  medicine_name: z.string().trim().min(1).max(300),
  batch_number: z.string().trim().min(1),
  expiry_date: dateOnlySchema,
  quantity: z.number().int().positive().max(2147483647),
  mrp: z.number().finite().positive(),
  purchase_price: z.number().finite().positive(),
  generic_name: z.string().trim().optional().nullable(),
  gst_rate: z.number().refine((v) => [0, 5, 12, 18, 28].includes(v)).default(12),
}).strict();

bulkRouter.post('/medicines', async (req, res, next) => {
  try {
    const result = await importMedicines(req.body?.medicines ?? req.body, req.user!.clinic_id!);
    res.status(201).json(result);
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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await localMutate({
          table: 'customers',
          operation: 'INSERT',
          data: {
            clinic_id: clinicId,
            name: row.name,
            phone: row.phone,
            email: row.email || null,
            address: row.address || null,
          }
        });
        success += 1;
      } catch (e: any) {
        errors.push({ index: i, message: e.message });
      }
    }

    res.status(201).json({ success, failed: errors.length, errors });
  } catch (err) {
    next(err);
  }
});

bulkRouter.post('/inventory', async (req, res, next) => {
  try {
    const rows = z.array(openingStockRowSchema).min(1).max(2000).parse(req.body.lines ?? req.body);
    const clinicId = req.user!.clinic_id!;
    const result = await withPostgresTransaction(async () => {
      await queryRaw('SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))', ['medicine-import', clinicId]);
      const key = importIdentity(clinicId, `opening-stock:${JSON.stringify(rows)}`);
      const previous = await queryAll('purchases', 'clinic_id=? AND _local_id=?', [clinicId, key]);
      if (previous.length) return { success: 0, skipped: rows.length, failed: 0, errors: [], purchase_id: key };
      const purchase = await localMutate({
        table: 'purchases', operation: 'INSERT', data: {
          clinic_id: clinicId, id: key, _local_id: key,
          invoice_number: `OPENING-${Date.now()}`, invoice_date: new Date().toISOString().split('T')[0],
          net_amount: 0, subtotal: 0, payment_status: 'paid', paid_amount: 0, created_by: req.user!.id,
        },
      });
      for (const [index, row] of rows.entries()) {
        const matches = await queryAll('medicines', 'clinic_id=? AND is_active=true AND LOWER(TRIM(name))=LOWER(?)', [clinicId, row.medicine_name]);
        const candidates = row.generic_name
          ? matches.filter(med => String(med.generic_name || '').trim().toLowerCase() === row.generic_name!.trim().toLowerCase())
          : matches;
        if (candidates.length > 1) throw new AppError(409, `Row ${index + 2}: multiple medicines match this name. Resolve the duplicates before importing stock. No rows were imported.`, 'IMPORT_AMBIGUOUS_MEDICINE');
        const med = candidates[0] || await localMutate({
          table: 'medicines', operation: 'INSERT', data: {
            clinic_id: clinicId, name: row.medicine_name, generic_name: row.generic_name || null,
            category: 'tablet', gst_rate: row.gst_rate, is_active: true,
          },
        });
        const batches = await queryAll('medicine_batches', 'clinic_id=? AND medicine_id=? AND batch_number=?', [clinicId, med.id, row.batch_number]);
        if (batches.length) throw new AppError(409, `Row ${index + 2}: this batch already exists. Use a purchase to add stock to an existing batch. No rows were imported.`, 'IMPORT_EXISTING_BATCH');
        const batch = await localMutate({
          table: 'medicine_batches', operation: 'INSERT', data: {
            clinic_id: clinicId, medicine_id: med.id, purchase_id: purchase.id,
            batch_number: row.batch_number, expiry_date: row.expiry_date,
            quantity_in: row.quantity, quantity_remaining: row.quantity,
            purchase_price: row.purchase_price, mrp: row.mrp,
          },
        });
        await localMutate({ table: 'stock_ledger', operation: 'INSERT', data: {
          clinic_id: clinicId, medicine_id: med.id, batch_id: batch.id, movement_type: 'OPENING_STOCK',
          quantity_delta: row.quantity, balance_after: row.quantity, reference_id: purchase.id,
        } });
      }
      return { success: rows.length, skipped: 0, failed: 0, errors: [], purchase_id: key };
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
