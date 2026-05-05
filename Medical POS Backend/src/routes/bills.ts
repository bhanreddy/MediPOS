import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

export const billsRouter = Router();

/**
 * FIFO Batch Deduction function
 * Deducts stock from the oldest expiring batches first for a given medicine.
 */
async function applyFifoDeduction(clinicId: string, medicineId: string, quantityToDeduct: number) {
  let remainingToDeduct = quantityToDeduct;

  // Fetch batches for this medicine, ordered by expiry date (FIFO)
  const { data: batches, error } = await supabaseAdmin
    .from('medicine_batches')
    .select('id, quantity_remaining')
    .eq('clinic_id', clinicId)
    .eq('medicine_id', medicineId)
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true });

  if (error || !batches) {
    console.error(`Failed to fetch batches for FIFO deduction:`, error);
    return;
  }

  for (const batch of batches) {
    if (remainingToDeduct <= 0) break;

    const deductAmount = Math.min(batch.quantity_remaining, remainingToDeduct);
    const newQuantity = batch.quantity_remaining - deductAmount;

    // Update batch in DB
    await supabaseAdmin
      .from('medicine_batches')
      .update({ quantity_remaining: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', batch.id)
      .eq('clinic_id', clinicId);

    remainingToDeduct -= deductAmount;
  }
  
  if (remainingToDeduct > 0) {
    console.warn(`Insufficient stock for medicine ${medicineId}. Leftover to deduct: ${remainingToDeduct}`);
  }
}

// POST /api/bills/sync
billsRouter.post('/sync', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    const clinicId = req.user?.clinic_id;

    if (!clinicId) {
      return res.status(400).json({ success: false, error: 'No clinic associated with this account.' });
    }

    // Enforce server-side clinic_id
    payload.clinic_id = clinicId;
    
    // Ensure we have a client_id for idempotency
    const clientId = payload.id || payload.client_id;
    if (!clientId) {
      return res.status(400).json({ success: false, error: 'client_id or id is required for idempotency' });
    }
    payload.client_id = clientId;
    delete payload.id; // Let server generate its own ID or we map client_id to id

    // Extract items
    const items = payload.items;
    delete payload.items;

    // Upsert into sales table: ON CONFLICT (client_id) DO NOTHING
    const { data: existingSale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('id')
      .eq('client_id', clientId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ success: false, error: fetchError.message });
    }

    if (existingSale) {
      // Idempotency: Duplicate submission, return success but don't re-deduct
      return res.json({ success: true, bill_id: existingSale.id });
    }

    // Insert new sale
    const { data: newSale, error: insertError } = await supabaseAdmin
      .from('sales')
      .insert(payload)
      .select('id')
      .single();

    if (insertError) {
      return res.status(500).json({ success: false, error: insertError.message });
    }

    // Insert sale_items and deduct stock
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((item: any) => ({
        ...item,
        sale_id: newSale.id, // Link to the newly generated sale ID
        id: undefined, // Let PostgreSQL generate the ID
        _local_id: item.id || item._local_id, // Store local ID
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('sale_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Failed to insert sale_items:', itemsError);
      }

      for (const item of items) {
        const medicineId = item.medicine_id || item.product_id;
        if (medicineId && item.quantity) {
          await applyFifoDeduction(clinicId, medicineId, item.quantity);
        }
      }
    }

    res.json({ success: true, bill_id: newSale.id });
  } catch (err) {
    console.error('[Bills Sync]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default billsRouter;
