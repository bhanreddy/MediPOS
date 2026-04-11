import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { createPurchaseSchema, updatePaymentSchema, csvRowSchema } from '../schemas/purchase.schema';
import { restockBatch } from '../services/stockLedger';
import { auditLog } from '../services/auditLog';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { parse as parseCsv } from 'csv-parse/sync';

export const purchasesRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/purchases
purchasesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const supplier_id = req.query.supplier_id as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('purchases')
      .select('*, suppliers(name)', { count: 'exact' })
      .eq('clinic_id', req.user!.clinic_id!)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (supplier_id) query = query.eq('supplier_id', supplier_id);
    if (status) query = query.eq('payment_status', status);
    if (from) query = query.gte('invoice_date', from);
    if (to) query = query.lte('invoice_date', to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: { Math, page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/purchases/:id
purchasesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: purchase, error } = await supabaseAdmin
      .from('purchases')
      .select('*, purchase_items(*, medicines(name, generic_name))')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (error) throw error;
    res.json({ data: purchase });
  } catch (err) {
    next(err);
  }
});

// POST /api/purchases
purchasesRouter.post('/', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = createPurchaseSchema.parse(req.body);
    
    // Server-side calculations
    let subtotal = 0;
    let gst_amount = 0;

    for (const item of parsed.items) {
      subtotal += item.quantity * item.purchase_price;
      gst_amount += (item.quantity * item.purchase_price * item.gst_rate) / 100;
    }

    const net_amount = subtotal - 0 + gst_amount; // assuming no bill-level discount field on schema, fallback to 0

    // Insert purchase
    const { data: purchase, error: pErr } = await supabaseAdmin
      .from('purchases')
      .insert({
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
      })
      .select()
      .single();

    if (pErr) throw pErr;

    // Process items & restock
    const pItemsToInsert = [];
    for (const item of parsed.items) {
      const batchId = await restockBatch({
        medicine_id: item.medicine_id,
        supplier_id: parsed.supplier_id,
        purchase_id: purchase.id,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        quantity: item.quantity,
        purchase_price: item.purchase_price,
        mrp: item.mrp
      }, req.user!.clinic_id!, supabaseAdmin);

      pItemsToInsert.push({
        clinic_id: req.user!.clinic_id!,
        purchase_id: purchase.id,
        medicine_id: item.medicine_id,
        batch_id: batchId,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        quantity: item.quantity,
        purchase_price: item.purchase_price,
        mrp: item.mrp,
        gst_rate: item.gst_rate,
        discount: item.discount,
        total: item.quantity * item.purchase_price * (1 - item.discount / 100)
      });
    }

    const { error: piErr } = await supabaseAdmin.from('purchase_items').insert(pItemsToInsert);
    if (piErr) throw piErr;

    // Update supplier
    if (parsed.supplier_id) {
      const { data: supp } = await supabaseAdmin
        .from('suppliers')
        .select('outstanding_balance')
        .eq('id', parsed.supplier_id)
        .single();
      
      if (supp) {
        await supabaseAdmin.from('suppliers')
          .update({ outstanding_balance: Number(supp.outstanding_balance) + net_amount })
          .eq('id', parsed.supplier_id);
      }
    }

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'CREATE', table: 'purchases', newData: purchase });

    res.status(201).json({ data: purchase });
  } catch (err) {
    next(err);
  }
});

// PUT /api/purchases/:id
purchasesRouter.put('/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { invoice_number, invoice_date, notes } = req.body;
    
    const { data, error } = await supabaseAdmin
      .from('purchases')
      .update({ invoice_number, invoice_date, notes })
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;
    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'UPDATE', table: 'purchases', newData: data, recordId: req.params.id });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/purchases/:id/payment
purchasesRouter.patch('/:id/payment', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = updatePaymentSchema.parse(req.body);

    const { data: oldPurchase, error: oldPErr } = await supabaseAdmin
      .from('purchases')
      .select('paid_amount, net_amount, supplier_id')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (oldPErr) throw oldPErr;

    const { data, error } = await supabaseAdmin
      .from('purchases')
      .update({ paid_amount: parsed.paid_amount, payment_status: parsed.payment_status })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Recalculate supplier delta if supplier exists
    if (oldPurchase.supplier_id) {
      const differencePaid = parsed.paid_amount - Number(oldPurchase.paid_amount);
      const { data: supp } = await supabaseAdmin.from('suppliers').select('outstanding_balance').eq('id', oldPurchase.supplier_id).single();
      if (supp) {
        await supabaseAdmin.from('suppliers')
          .update({ outstanding_balance: Number(supp.outstanding_balance) - differencePaid })
          .eq('id', oldPurchase.supplier_id);
      }
    }

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'PAYMENT_UPDATE', table: 'purchases', newData: data, oldData: oldPurchase, recordId: req.params.id });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/purchases/bill-scan
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
purchasesRouter.post('/import-csv', requireAuth, requireRole('OWNER'), upload.single('file'), async (req, res, next) => {
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

        // Find or create medicine
        let medicineId;
        const { data: existMed } = await supabaseAdmin.from('medicines').select('id').eq('clinic_id', req.user!.clinic_id!).ilike('name', validated.medicine_name).single();
        
        if (existMed) {
          medicineId = existMed.id;
        } else {
          const { data: newMed, error: mErr } = await supabaseAdmin.from('medicines').insert({
            clinic_id: req.user!.clinic_id!,
            name: validated.medicine_name,
            generic_name: validated.generic_name || null,
            manufacturer: validated.manufacturer || null,
            gst_rate: validated.gst_rate
          }).select('id').single();
          if (mErr) throw mErr;
          medicineId = newMed.id;
        }

        // Dummy insert into purchases or use a default CSV imported purchase ID
        // Note: The spec asks to find/create medicine, restock batch.
        // Restocking a batch without a purchase requires purchase_id to be nullable or create a generic one.
        // Assuming we just append to generic import.
        
        await restockBatch({
          medicine_id: medicineId,
          purchase_id: null as any, // Warning: DB enforces FK or nullable. The schema says purchase_id FK but can we skip? Schema says purchase_id `uuid` (no NOT NULL). So null is fine!
          batch_number: validated.batch_number,
          expiry_date: expiryIso,
          quantity: validated.quantity,
          purchase_price: validated.purchase_price,
          mrp: validated.mrp
        }, req.user!.clinic_id!, supabaseAdmin);

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
