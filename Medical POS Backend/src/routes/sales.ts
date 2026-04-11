import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { createSaleSchema, saleReturnSchema } from '../schemas/sale.schema';
import { deductStock, restoreStock, checkAndAutoShortbook } from '../services/stockLedger';
import { generateInvoiceNumber } from '../services/invoiceNumber';
import { recalculateImportanceScore } from '../services/importanceScore';
import { scheduleRefillReminders } from '../services/refillReminder';
import { auditLog } from '../services/auditLog';
import { sendInvoiceWhatsApp } from '../services/whatsapp';
import { env } from '../config/env';
import { AppError } from '../lib/appError';

export const salesRouter = Router();

// GET /api/sales
salesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const customer_id = req.query.customer_id as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const payment_status = req.query.payment_status as string;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('sales')
      .select('*, customers(name)', { count: 'exact' })
      .eq('clinic_id', req.user!.clinic_id!)
      .range(offset, offset + limit - 1)
      .order('sale_date', { ascending: false });

    if (customer_id) query = query.eq('customer_id', customer_id);
    if (payment_status) query = query.eq('payment_status', payment_status);
    if (from) query = query.gte('sale_date', from);
    if (to) query = query.lte('sale_date', to);

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

// GET /api/sales/:id
salesRouter.get('/:id', requireAuth, async (req, res, next) => {
  if (req.params.id === 'returns') return next();
  try {
    const { data: sale, error } = await supabaseAdmin
      .from('sales')
      .select('*, sale_items(*, medicines(name), medicine_batches(batch_number))')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (error) throw error;
    res.json({ data: sale });
  } catch (err) {
    next(err);
  }
});

import { enforcePlan } from '../middleware/planEnforcement';

// POST /api/sales
salesRouter.post('/', requireAuth, requireRole('PHARMACIST', 'CASHIER', 'OWNER'), enforcePlan, async (req, res, next) => {
  try {
    const parsed = createSaleSchema.parse(req.body);

    // 1. Stock Validation & Deduction
    // Ensure the batch belongs to this clinic handled inside stockLedger
    await deductStock(parsed.items, req.user!.clinic_id!, supabaseAdmin);

    // 2. Calculations
    let subtotal = 0;
    let gst_amount = 0;
    const sItemsToInsert = [];

    for (const item of parsed.items) {
      const itemTotal = item.quantity * item.mrp * (1 - item.discount_pct / 100);
      subtotal += itemTotal;
      // GST is usually calculated on the discounted taxable value if inclusive vs exclusive.
      // Assuming exclusive standard calculation:
      gst_amount += (item.quantity * item.mrp * item.gst_rate) / 100;
      
      sItemsToInsert.push({
        clinic_id: req.user!.clinic_id!,
        medicine_id: item.medicine_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        mrp: item.mrp,
        discount_pct: item.discount_pct,
        gst_rate: item.gst_rate,
        total: itemTotal
      });
    }

    const net_amount = subtotal - parsed.discount + gst_amount;
    const balance_due = Math.max(net_amount - parsed.paid_amount, 0);

    // 3. Invoice Number
    const invoice_number = await generateInvoiceNumber(req.user!.clinic_id!);

    // 4. Insert Sale
    const { data: sale, error: sErr } = await supabaseAdmin
      .from('sales')
      .insert({
        clinic_id: req.user!.clinic_id!,
        customer_id: parsed.customer_id || null,
        invoice_number,
        subtotal,
        discount: parsed.discount,
        gst_amount,
        net_amount,
        payment_mode: parsed.payment_mode,
        payment_status: parsed.payment_status,
        paid_amount: parsed.paid_amount,
        balance_due,
        served_by: req.user!.id,
      })
      .select()
      .single();

    if (sErr) throw sErr;

    // 5. Insert Sale Items
    const finalItems = sItemsToInsert.map(i => ({ ...i, sale_id: sale.id }));
    const { error: siErr } = await supabaseAdmin.from('sale_items').insert(finalItems);
    if (siErr) throw siErr;

    // 6. Update Customer Outstanding
    if (parsed.customer_id && balance_due > 0) {
      const { data: cust } = await supabaseAdmin.from('customers').select('outstanding_balance').eq('id', parsed.customer_id).single();
      if (cust) {
        await supabaseAdmin.from('customers').update({
          outstanding_balance: Number(cust.outstanding_balance) + balance_due
        }).eq('id', parsed.customer_id);
      }
    }

    // 7. Background Tasks
    if (parsed.customer_id) {
      recalculateImportanceScore(parsed.customer_id, req.user!.clinic_id!, supabaseAdmin).catch(console.error);
      scheduleRefillReminders(sale.id, req.user!.clinic_id!, supabaseAdmin).catch(console.error);
    }

    for (const item of parsed.items) {
      checkAndAutoShortbook(item.medicine_id, req.user!.clinic_id!, supabaseAdmin).catch(console.error);
    }

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'CREATE', table: 'sales', newData: sale });

    // Fetch back fully eager loaded
    const { data: fullSale } = await supabaseAdmin.from('sales')
      .select('*, sale_items(*)').eq('id', sale.id).single();

    res.status(201).json({ data: fullSale });

    // --- PHASE 6 : WHATSAPP INVOICE ---
    if (parsed.customer_id) {
       const { data: customer } = await supabaseAdmin.from('customers').select('*').eq('id', parsed.customer_id).single();
       if (customer?.phone) {
           const { data: clinic } = await supabaseAdmin.from('clinics').select('name').eq('id', req.user!.clinic_id!).single();
           const invoiceUrl = `${env.APP_URL || 'https://api.yourmedicalpos.com'}/public/invoice/${sale.id}`;
           sendInvoiceWhatsApp({
               customerPhone: customer.phone,
               customerName: customer.name,
               invoiceNumber: sale.invoice_number,
               netAmount: sale.net_amount,
               clinicName: clinic?.name || 'Clinic',
               invoiceUrl
           }).catch(console.error);
       }
    }

  } catch (err) {
    if (req.get('x-offline-sync') === '1' && err instanceof AppError && err.code === 'INSUFFICIENT_STOCK') {
      return next(new AppError(400, err.message, 'STOCK_CHANGED_WHILE_OFFLINE'));
    }
    next(err);
  }
});

// POST /api/sales/returns
salesRouter.post('/returns', requireAuth, requireRole('PHARMACIST', 'OWNER'), async (req, res, next) => {
  try {
    const parsed = saleReturnSchema.parse(req.body);

    const { data: originalSale, error: origErr } = await supabaseAdmin
      .from('sales')
      .select('*')
      .eq('id', parsed.original_sale_id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (origErr) throw origErr;

    const { data: originalItems } = await supabaseAdmin
      .from('sale_items')
      .select('*')
      .eq('sale_id', parsed.original_sale_id);

    // Verify quantities
    const restorePayload = [];
    let returnSubtotal = 0;

    for (const retItem of parsed.items) {
      const origItem = originalItems?.find(i => i.id === retItem.sale_item_id);
      if (!origItem) {
        throw new AppError(400, `Item ${retItem.sale_item_id} not found in original sale.`, 'RETURN_ITEM_NOT_FOUND');
      }
      if (retItem.quantity > origItem.quantity) {
        throw new AppError(
          400,
          `Return quantity exceeds original sold quantity for item ${origItem.medicine_id}`,
          'RETURN_QTY_EXCEEDED'
        );
      }
      restorePayload.push({ batch_id: origItem.batch_id, quantity: retItem.quantity });
      returnSubtotal += origItem.mrp * retItem.quantity * (1 - origItem.discount_pct / 100);
    }

    await restoreStock(restorePayload, req.user!.clinic_id!, supabaseAdmin);

    const invoice_number = await generateInvoiceNumber(req.user!.clinic_id!);

    // net_amount is negative for returns usually or we just record it positive but is_return handles logic.
    // Spec: "net_amount = negative (credit)"
    const net_amount = -returnSubtotal; 

    const { data: returnSale, error: retErr } = await supabaseAdmin
      .from('sales')
      .insert({
        clinic_id: req.user!.clinic_id!,
        customer_id: originalSale.customer_id,
        invoice_number,
        net_amount,
        subtotal: net_amount,
        is_return: true,
        return_of: originalSale.id,
        served_by: req.user!.id,
        // Reset balances since it's a return
      })
      .select()
      .single();

    if (retErr) throw retErr;

    if (originalSale.customer_id && originalSale.balance_due > 0) {
      // Logic to reduce outstanding
      const { data: cust } = await supabaseAdmin.from('customers').select('outstanding_balance').eq('id', originalSale.customer_id).single();
      if (cust) {
        // Reduct min of the return value vs what they owe
        const newBalance = Math.max(Number(cust.outstanding_balance) + net_amount, 0); // negative addition
        await supabaseAdmin.from('customers').update({ outstanding_balance: newBalance }).eq('id', originalSale.customer_id);
      }
    }

    await auditLog({ clinicId: req.user!.clinic_id!, userId: req.user!.id, action: 'RETURN', table: 'sales', newData: returnSale });

    res.json({ data: returnSale });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/:id/invoice
salesRouter.get('/:id/invoice', requireAuth, async (req, res, next) => {
  try {
    const { data: sale, error } = await supabaseAdmin
      .from('sales')
      .select('*, customers(*), sale_items(*, medicines(name, hsn_code), medicine_batches(batch_number, expiry_date))')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (error) throw error;

    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('*')
      .eq('id', req.user!.clinic_id!)
      .single();

    // Basic HTML template for the PDF layout matching standard thermal/A4 logic
    const html = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <h2>${clinic?.name}</h2>
          <p>${clinic?.address || ''}<br/>GSTIN: ${clinic?.gstin || 'N/A'}<br/>DL No: ${clinic?.drug_licence_number || 'N/A'}</p>
          <hr />
          <h3>Invoice #${sale.invoice_number}</h3>
          <p>Date: ${new Date(sale.sale_date).toLocaleString()}<br/>
             Customer: ${sale.customers?.name || 'Walk-in'}</p>
          <table>
             <tr><th>Item</th><th>Batch/Exp</th><th>Qty</th><th>MRP</th><th>Total</th></tr>
             ${sale.sale_items.map((i: any) => `
                <tr>
                  <td>${i.medicines?.name}</td>
                  <td>${i.medicine_batches?.batch_number} / ${i.medicine_batches?.expiry_date}</td>
                  <td>${i.quantity}</td>
                  <td>${i.mrp}</td>
                  <td class="right">${i.total}</td>
                </tr>
             `).join('')}
             <tr><th colspan="4" class="right">Subtotal</th><th class="right">${sale.subtotal}</th></tr>
             <tr><th colspan="4" class="right">Discount</th><th class="right">${sale.discount}</th></tr>
             <tr><th colspan="4" class="right">GST</th><th class="right">${sale.gst_amount}</th></tr>
             <tr><th colspan="4" class="right"><strong>Grand Total</strong></th><th class="right"><strong>${sale.net_amount}</strong></th></tr>
          </table>
          <p style="margin-top:20px; font-size:12px;">${clinic?.invoice_footer || ''}</p>
        </body>
      </html>
    `;

    res.json({ data: { html, sale, clinic } });
  } catch (err) {
    next(err);
  }
});

export default salesRouter;
