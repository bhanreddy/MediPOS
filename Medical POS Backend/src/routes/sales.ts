import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createSaleSchema, saleReturnSchema } from '../schemas/sale.schema';
import { localMutate } from '../lib/localMutate';
import { queryAll, queryOne, queryRaw } from '../lib/localQuery';

export const salesRouter = Router();

// GET /api/sales
salesRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const customer_id = req.query.customer_id as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const payment_status = req.query.payment_status as string;

    const conditions: string[] = [];
    const values: any[] = [];

    if (customer_id) { conditions.push('customer_id=?'); values.push(customer_id); }
    if (payment_status) { conditions.push('payment_status=?'); values.push(payment_status); }
    if (from) { conditions.push('created_at>=?'); values.push(from); }
    if (to) { conditions.push('created_at<=?'); values.push(to); }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '';
    const all = queryAll('sales', where, values);

    all.sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

    const offset = (page - 1) * limit;
    const data = all.slice(offset, offset + limit);

    // Attach customer name
    for (const sale of data) {
      if ((sale as any).customer_id) {
        const cust = queryOne('customers', '_local_id=? OR id=?', [(sale as any).customer_id, (sale as any).customer_id]);
        (sale as any).customers = { name: (cust as any)?.name ?? '' };
      }
    }

    res.json({
      data,
      pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/:id
salesRouter.get('/:id', requireAuth, (req, res, next) => {
  if (req.params.id === 'returns') return next();
  try {
    const sale = queryOne('sales', '_local_id=? OR id=?', [req.params.id, req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const saleId = (sale as any)._local_id;
    const saleItems = queryAll('sale_items', 'sale_id=?', [saleId]);

    // Attach medicine names and batch numbers
    for (const item of saleItems) {
      if ((item as any).medicine_id) {
        const med = queryOne('medicines', '_local_id=? OR id=?', [(item as any).medicine_id, (item as any).medicine_id]);
        (item as any).medicines = { name: (med as any)?.name ?? '' };
      }
      if ((item as any).batch_id) {
        const batch = queryOne('medicine_batches', '_local_id=? OR id=?', [(item as any).batch_id, (item as any).batch_id]);
        (item as any).medicine_batches = { batch_number: (batch as any)?.batch_number ?? '', expiry_date: (batch as any)?.expiry_date ?? '' };
      }
    }

    res.json({ data: { ...sale, sale_items: saleItems } });
  } catch (err) {
    next(err);
  }
});

import { enforcePlan } from '../middleware/planEnforcement';

// POST /api/sales
salesRouter.post('/', requireAuth, requireRole('PHARMACIST', 'CASHIER', 'OWNER'), enforcePlan, (req, res, next) => {
  try {
    const parsed = createSaleSchema.parse(req.body);

    // Stock Validation
    for (const item of parsed.items) {
      const batch = queryOne('medicine_batches', '(_local_id=? OR id=?)', [item.batch_id, item.batch_id]);
      if (!batch) throw new Error(`Batch not found: ${item.batch_id}`);
      if (Number((batch as any).quantity_remaining ?? 0) < item.quantity) {
        const med = queryOne('medicines', '_local_id=? OR id=?', [item.medicine_id, item.medicine_id]);
        throw new Error(`Insufficient stock for ${(med as any)?.name ?? item.medicine_id}. Available: ${(batch as any).quantity_remaining}, Requested: ${item.quantity}`);
      }
    }

    // Calculations
    let subtotal = 0;
    let gst_amount = 0;
    const sItemsToInsert = [];

    for (const item of parsed.items) {
      const itemTotal = item.quantity * item.mrp * (1 - item.discount_pct / 100);
      subtotal += itemTotal;
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

    // Insert Sale locally
    const sale = localMutate({
      table: 'sales',
      operation: 'INSERT',
      data: {
        clinic_id: req.user!.clinic_id!,
        customer_id: parsed.customer_id || null,
        invoice_number: `LOCAL-${Date.now()}`,
        subtotal,
        discount: parsed.discount,
        gst_amount,
        net_amount,
        payment_mode: parsed.payment_mode,
        payment_status: parsed.payment_status,
        paid_amount: parsed.paid_amount,
        balance_due,
        served_by: req.user!.id,
      }
    });

    // Insert Sale Items + deduct stock
    const finalItems = sItemsToInsert.map(i => ({ ...i, sale_id: sale._local_id }));
    for (const item of finalItems) {
      localMutate({ table: 'sale_items', operation: 'INSERT', data: item });

      // Immediately deduct stock
      const batch = queryOne('medicine_batches', '(_local_id=? OR id=?)', [item.batch_id, item.batch_id]);
      if (batch) {
        localMutate({
          table: 'medicine_batches',
          operation: 'UPDATE',
          data: {
            _local_id: (batch as any)._local_id,
            quantity_remaining: Math.max(0, Number((batch as any).quantity_remaining) - item.quantity),
          }
        });
      }
    }

    res.status(201).json({ data: { ...sale, sale_items: finalItems } });
  } catch (err) {
    next(err);
  }
});

// POST /api/sales/returns
salesRouter.post('/returns', requireAuth, requireRole('PHARMACIST', 'OWNER'), (req, res, next) => {
  try {
    const parsed = saleReturnSchema.parse(req.body);

    // Insert return sale locally
    const returnSale = localMutate({
      table: 'sales',
      operation: 'INSERT',
      data: {
        clinic_id: req.user!.clinic_id!,
        invoice_number: `RET-LOCAL-${Date.now()}`,
        is_return: true,
        return_of: parsed.original_sale_id,
        served_by: req.user!.id,
      }
    });

    // Insert return items + restore stock
    for (const retItem of parsed.items) {
      localMutate({
        table: 'sale_items',
        operation: 'INSERT',
        data: {
          clinic_id: req.user!.clinic_id!,
          sale_id: returnSale._local_id,
          sale_item_id: retItem.sale_item_id,
          quantity: retItem.quantity,
          reason: retItem.reason,
        }
      });

      // Restore batch stock
      const origItem = queryOne('sale_items', '_local_id=? OR id=?', [retItem.sale_item_id, retItem.sale_item_id]);
      if (origItem && (origItem as any).batch_id) {
        const batch = queryOne('medicine_batches', '(_local_id=? OR id=?)', [(origItem as any).batch_id, (origItem as any).batch_id]);
        if (batch) {
          localMutate({
            table: 'medicine_batches',
            operation: 'UPDATE',
            data: {
              _local_id: (batch as any)._local_id,
              quantity_remaining: Number((batch as any).quantity_remaining) + retItem.quantity,
            }
          });
        }
      }
    }

    res.json({ data: returnSale });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/:id/invoice
salesRouter.get('/:id/invoice', requireAuth, (req, res, next) => {
  try {
    const sale = queryOne('sales', '_local_id=? OR id=?', [req.params.id, req.params.id]) as any;
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const saleItems = queryAll('sale_items', 'sale_id=?', [sale._local_id]);
    const clinic = queryOne('clinics', '1=1') as any;

    // Attach medicine names
    for (const item of saleItems) {
      if ((item as any).medicine_id) {
        const med = queryOne('medicines', '_local_id=? OR id=?', [(item as any).medicine_id, (item as any).medicine_id]);
        (item as any).medicines = { name: (med as any)?.name ?? '' };
      }
      if ((item as any).batch_id) {
        const batch = queryOne('medicine_batches', '_local_id=? OR id=?', [(item as any).batch_id, (item as any).batch_id]);
        (item as any).medicine_batches = { batch_number: (batch as any)?.batch_number ?? '', expiry_date: (batch as any)?.expiry_date ?? '' };
      }
    }

    let customerName = 'Walk-in';
    if (sale.customer_id) {
      const cust = queryOne('customers', '_local_id=? OR id=?', [sale.customer_id, sale.customer_id]);
      customerName = (cust as any)?.name ?? 'Walk-in';
    }

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
          <h2>${clinic?.name ?? 'Medical Store'}</h2>
          <p>${clinic?.address || ''}<br/>GSTIN: ${clinic?.gstin || 'N/A'}<br/>DL No: ${clinic?.drug_licence_number || 'N/A'}</p>
          <hr />
          <h3>Invoice #${sale.invoice_number}</h3>
          <p>Date: ${sale.created_at}<br/>
             Customer: ${customerName}</p>
          <table>
             <tr><th>Item</th><th>Batch/Exp</th><th>Qty</th><th>MRP</th><th>Total</th></tr>
             ${(saleItems as any[]).map(i => `
                <tr>
                  <td>${i.medicines?.name ?? ''}</td>
                  <td>${i.medicine_batches?.batch_number ?? ''} / ${i.medicine_batches?.expiry_date ?? ''}</td>
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

    res.json({ data: { html, sale: { ...sale, sale_items: saleItems }, clinic } });
  } catch (err) {
    next(err);
  }
});

export default salesRouter;
