import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { createPurchaseSchema, updatePaymentSchema, csvRowSchema } from '../schemas/purchase.schema';
import { localMutate } from '../lib/localMutate';
import { queryAll, queryOne } from '../lib/localQuery';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { parse as parseCsv } from 'csv-parse/sync';

export const purchasesRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/purchases
purchasesRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const supplier_id = req.query.supplier_id as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const status = req.query.status as string;

    const conditions: string[] = [];
    const values: any[] = [];

    if (supplier_id) { conditions.push('supplier_id=?'); values.push(supplier_id); }
    if (status) { conditions.push('payment_status=?'); values.push(status); }
    if (from) { conditions.push('created_at>=?'); values.push(from); }
    if (to) { conditions.push('created_at<=?'); values.push(to); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const all = queryAll('purchases', where, values);

    all.sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

    // Attach supplier name
    for (const p of all) {
      if ((p as any).supplier_id) {
        const supp = queryOne('suppliers', '_local_id=? OR id=?', [(p as any).supplier_id, (p as any).supplier_id]);
        (p as any).suppliers = { name: (supp as any)?.name ?? '' };
      }
    }

    const offset = (page - 1) * limit;
    const data = all.slice(offset, offset + limit);

    res.json({
      data,
      pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/purchases/:id
purchasesRouter.get('/:id', requireAuth, (req, res, next) => {
  try {
    const purchase = queryOne('purchases', '_local_id=? OR id=?', [req.params.id, req.params.id]);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

    const purchaseId = (purchase as any)._local_id;
    const purchaseItems = queryAll('purchase_items', 'purchase_id=?', [purchaseId]);

    // Attach medicine names
    for (const item of purchaseItems) {
      if ((item as any).medicine_id) {
        const med = queryOne('medicines', '_local_id=? OR id=?', [(item as any).medicine_id, (item as any).medicine_id]);
        (item as any).medicines = { name: (med as any)?.name ?? '', generic_name: (med as any)?.generic_name ?? '' };
      }
    }

    res.json({ data: { ...purchase, purchase_items: purchaseItems } });
  } catch (err) {
    next(err);
  }
});

// POST /api/purchases
purchasesRouter.post('/', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const parsed = createPurchaseSchema.parse(req.body);
    
    // Server-side calculations
    let subtotal = 0;
    let gst_amount = 0;

    for (const item of parsed.items) {
      subtotal += item.quantity * item.purchase_price;
      gst_amount += (item.quantity * item.purchase_price * item.gst_rate) / 100;
    }

    const net_amount = subtotal - 0 + gst_amount;

    // Insert purchase locally
    const purchase = localMutate({
      table: 'purchases',
      operation: 'INSERT',
      data: {
        clinic_id: req.user!.clinic_id!,
        supplier_id: parsed.supplier_id || null,
        invoice_number: parsed.invoice_number,
        invoice_date: parsed.invoice_date,
        bill_image_url: parsed.bill_image_url,
        notes: parsed.notes,
        subtotal,
        discount: 0,
        gst_amount,
        net_amount,
        payment_status: 'unpaid',
        paid_amount: 0,
        created_by: req.user!.id
      }
    });

    // Insert purchase items + update batch stock
    for (const item of parsed.items) {
      localMutate({
        table: 'purchase_items',
        operation: 'INSERT',
        data: {
          clinic_id: req.user!.clinic_id!,
          purchase_id: purchase._local_id,
          medicine_id: item.medicine_id,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          quantity: item.quantity,
          purchase_price: item.purchase_price,
          mrp: item.mrp,
          gst_rate: item.gst_rate,
          discount: item.discount,
          total: item.quantity * item.purchase_price * (1 - item.discount / 100)
        }
      });

      // Increment stock on batch
      const existingBatch = queryOne('medicine_batches', 'medicine_id=? AND batch_number=?', [item.medicine_id, item.batch_number]);
      if (existingBatch) {
        localMutate({
          table: 'medicine_batches',
          operation: 'UPDATE',
          data: {
            _local_id: (existingBatch as any)._local_id,
            quantity_remaining: Number((existingBatch as any).quantity_remaining ?? 0) + item.quantity,
          }
        });
      } else {
        localMutate({
          table: 'medicine_batches',
          operation: 'INSERT',
          data: {
            clinic_id: req.user!.clinic_id!,
            medicine_id: item.medicine_id,
            purchase_id: purchase._local_id,
            batch_number: item.batch_number,
            expiry_date: item.expiry_date,
            quantity_in: item.quantity,
            quantity_remaining: item.quantity,
            purchase_price: item.purchase_price,
            mrp: item.mrp,
          }
        });
      }
    }

    res.status(201).json({ data: purchase });
  } catch (err) {
    next(err);
  }
});

// PUT /api/purchases/:id
purchasesRouter.put('/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const { invoice_number, invoice_date, notes } = req.body;
    
    const data = localMutate({
      table: 'purchases',
      operation: 'UPDATE',
      data: { invoice_number, invoice_date, notes, _local_id: req.params.id }
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/purchases/:id/payment
purchasesRouter.patch('/:id/payment', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const parsed = updatePaymentSchema.parse(req.body);

    const data = localMutate({
      table: 'purchases',
      operation: 'UPDATE',
      data: { paid_amount: parsed.paid_amount, payment_status: parsed.payment_status, _local_id: req.params.id }
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/purchases/bill-scan (requires network — Anthropic AI)
purchasesRouter.post('/bill-scan', requireAuth, async (req, res, next) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'imageBase64 and mimeType are required' });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const filename = `${new Date().getTime()}.jpg`;
    
    // Upload image
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('purchase-bills')
      .upload(`${req.user!.clinic_id!}/${filename}`, buffer, { contentType: mimeType });

    if (uploadError) throw uploadError;

    const bill_image_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/purchase-bills/${req.user!.clinic_id!}/${filename}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 2000,
      system: 'You are a pharmacy bill parser. Extract structured data.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as any, data: imageBase64 }
            },
            {
              type: 'text',
              text: "Extract: supplier name, invoice number, invoice date (YYYY-MM-DD), and all line items: medicine name, batch number, expiry date (YYYY-MM-DD), quantity, MRP, purchase price, GST rate. Return ONLY valid JSON, no markdown."
            }
          ]
        }
      ]
    });

    // Remove markdown fences from claude output
    let text = (response.content[0] as any).text.trim();
    if (text.startsWith('```json')) text = text.replace(/^```json/, '');
    if (text.startsWith('```')) text = text.replace(/^```/, '');
    if (text.endsWith('```')) text = text.replace(/```$/, '');
    
    const parsedData = JSON.parse(text.trim());

    res.json({ data: { bill_image_url, extracted: parsedData } });
  } catch (err) {
    next(err);
  }
});

// POST /api/purchases/import-csv
purchasesRouter.post('/import-csv', requireAuth, requireRole('OWNER'), upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    const records = parseCsv(req.file.buffer, { columns: true, skip_empty_lines: true });

    let success = 0;
    let failed = 0;
    const errors = [];

    for (const record of records) {
      try {
        const validated = csvRowSchema.parse(record);
        
        // Convert MM/YYYY -> YYYY-MM-DD
        const [mm, yyyy] = validated.expiry_date.split('/');
        const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
        const expiryIso = `${yyyy}-${mm.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

        // Create medicine locally
        const med = localMutate({
          table: 'medicines',
          operation: 'INSERT',
          data: {
            clinic_id: req.user!.clinic_id!,
            name: validated.medicine_name,
            generic_name: validated.generic_name || null,
            manufacturer: validated.manufacturer || null,
            gst_rate: validated.gst_rate,
            is_active: 1,
          }
        });

        // Create batch locally
        localMutate({
          table: 'medicine_batches',
          operation: 'INSERT',
          data: {
            clinic_id: req.user!.clinic_id!,
            medicine_id: med._local_id,
            batch_number: validated.batch_number,
            expiry_date: expiryIso,
            quantity_received: validated.quantity,
            quantity_remaining: validated.quantity,
            purchase_price: validated.purchase_price,
            mrp: validated.mrp,
          }
        });

        success++;
      } catch (e: any) {
        failed++;
        errors.push({ row: record, reason: e.message });
      }
    }

    res.json({ data: { success, failed, errors } });
  } catch (err) {
    next(err);
  }
});

export default purchasesRouter;
