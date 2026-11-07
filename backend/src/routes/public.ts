import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

export const publicRouter = Router();
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);


// GET /public/invoice/:sale_id
// Invoice IDs are identifiers, not credentials. Require the owning clinic's session.
publicRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
publicRouter.get('/invoice/:sale_id', requireAuth, async (req, res, next) => {
  try {
    const saleId = req.params.sale_id;
    const clinicId = req.user?.clinic_id;
    if (!clinicId) return res.status(403).json({ error: 'Clinic context is required' });

    const { data: sale, error } = await supabaseAdmin
      .from('sales')
      .select('*, customers(*), sale_items(*, medicines(name, hsn_code, clinic_id), medicine_batches(batch_number, expiry_date, clinic_id))')
      .eq('id', saleId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .single();

    if (error || !sale) {
      return res.status(404).send('<h1>Invoice Not Found</h1>');
    }

    if ((sale.customers && sale.customers.clinic_id !== clinicId) ||
        (sale.sale_items || []).some((item: any) => item.clinic_id !== clinicId ||
          (item.medicines && item.medicines.clinic_id !== clinicId) ||
          (item.medicine_batches && item.medicine_batches.clinic_id !== clinicId))) {
      return res.status(404).send('<h1>Invoice Not Found</h1>');
    }

    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('*')
      .eq('id', sale.clinic_id)
      .single();

    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");

    // Return the HTML Invoice
    const html = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; max-width: 800px; margin: auto; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            .right { text-align: right; }
            .header-info { margin-bottom: 20px; }
            .total-row th { background-color: #f8f9fa; }
          </style>
        </head>
        <body>
          <div class="header-info">
            <h2>${escapeHtml(clinic?.name || 'Clinic')}</h2>
            <p>${escapeHtml(clinic?.address || '')}<br/>
            <strong>GSTIN:</strong> ${escapeHtml(clinic?.gstin || 'N/A')}<br/>
            <strong>DL No:</strong> ${escapeHtml(clinic?.drug_licence_number || 'N/A')}</p>
          </div>
          <hr />
          <h3>Invoice #${escapeHtml(sale.invoice_number)}</h3>
          <p>
             <strong>Date:</strong> ${new Date(sale.sale_date).toLocaleString()}<br/>
             <strong>Customer:</strong> ${escapeHtml(sale.customers?.name || 'Walk-in')}
          </p>
          <table>
             <thead>
               <tr>
                 <th>Item</th>
                 <th>Batch / Exp</th>
                 <th>Qty</th>
                 <th class="right">MRP</th>
                 <th class="right">Total</th>
               </tr>
             </thead>
             <tbody>
             ${sale.sale_items.map((i: any) => `
                <tr>
                  <td>${escapeHtml(i.medicines?.name)}</td>
                  <td>${escapeHtml(i.medicine_batches?.batch_number)} / ${new Date(i.medicine_batches?.expiry_date).toISOString().substring(0, 7)}</td>
                  <td>${escapeHtml(i.quantity)}</td>
                  <td class="right">${Number(i.mrp).toFixed(2)}</td>
                  <td class="right">${Number(i.total).toFixed(2)}</td>
                </tr>
             `).join('')}
             </tbody>
             <tfoot>
               <tr class="total-row"><th colspan="4" class="right">Subtotal</th><th class="right">${Number(sale.subtotal).toFixed(2)}</th></tr>
               <tr class="total-row"><th colspan="4" class="right">Discount</th><th class="right">${Number(sale.discount).toFixed(2)}</th></tr>
               <tr class="total-row"><th colspan="4" class="right">${sale.price_includes_tax ? 'GST (included)' : 'GST'}</th><th class="right">${Number(sale.gst_amount).toFixed(2)}</th></tr>
               <tr class="total-row"><th colspan="4" class="right"><strong>Grand Total</strong></th><th class="right"><strong>${Number(sale.net_amount).toFixed(2)}</strong></th></tr>
             </tfoot>
          </table>
          <p style="margin-top:40px; font-size:12px; color: #555; text-align: center;">${escapeHtml(clinic?.invoice_footer || '')}</p>
        </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    next(err);
  }
});
