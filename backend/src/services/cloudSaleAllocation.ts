import { queryRaw } from '../lib/postgresDb';
import { allocateFefo } from './fefoAllocation';
import { AppError } from '../lib/appError';
import { Money } from '../lib/money';
import type { z } from 'zod';
import type { saleItemSchema } from '../schemas/sale.schema';

type SaleInput = z.infer<typeof saleItemSchema>;
async function loadAllocationStock(ids: string[], clinicId: string, storeId: string | null, lock: boolean) {
  const medicines=await queryRaw(`SELECT * FROM medicines WHERE clinic_id=? AND deleted_at IS NULL
    AND (id::text = ANY(?::text[]) OR _local_id = ANY(?::text[])) ORDER BY id ${lock ? "FOR SHARE" : ""}`,[clinicId,ids,ids]);
  const medicineMap=new Map<string,any>();
  for(const medicine of medicines) { medicineMap.set(medicine.id,medicine);medicineMap.set(medicine._local_id,medicine); }
  // Lock the complete candidate set in stable ID order, then allocate in expiry
  // order. Two tills cannot both allocate the same remaining units.
  const batches=await queryRaw(`SELECT b.* FROM medicine_batches b WHERE b.clinic_id=? AND b.deleted_at IS NULL
    AND b.medicine_id = ANY(?::uuid[]) AND (?::uuid IS NULL OR EXISTS (
      SELECT 1 FROM branch_stock_snapshot stock WHERE stock.batch_id=b.id AND stock.store_id=?::uuid
    ))
    ORDER BY b.id ${lock ? "FOR UPDATE" : ""}`,[clinicId,medicines.map(m=>m.id),storeId,storeId]);
  const positions=storeId ? await queryRaw(`SELECT * FROM inventory_positions
    WHERE batch_id = ANY(?::uuid[]) AND store_id=? AND deleted_at IS NULL ORDER BY batch_id,id ${lock ? "FOR UPDATE" : ""}`,[batches.map(b=>b.id),storeId]) : [];
  const positionMap=new Map(positions.map(position=>[position.batch_id,position]));
  const recalls=await queryRaw(`SELECT product_id,batch_id FROM product_recalls WHERE status='ACTIVE' AND deleted_at IS NULL
    AND product_id=ANY(?::uuid[])`,[medicines.map(m=>m.id)]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const available=new Map<string,number>();
  for(const batch of batches) {
    const position=positionMap.get(batch.id);
    const blocked=position ? ['quantity_reserved','quantity_quarantined','quantity_damaged','quantity_recalled','quantity_on_hold','quantity_stocktake_locked'].reduce((sum,field)=>sum+Number(position[field]||0),0) : 0;
    const stock=Number(batch.quantity_remaining||0);
    const onHand=position ? Math.min(stock,Number(position.quantity_on_hand)) : stock;
    const expiry=batch.expiry_date ? new Date(batch.expiry_date).toISOString().slice(0,10) : '';
    const recalled=recalls.some(recall=>recall.product_id===batch.medicine_id && (!recall.batch_id||recall.batch_id===batch.id));
    available.set(batch.id, !expiry || expiry<today || batch.is_disposed || batch.is_recalled || recalled ? 0 : Math.max(0,onHand-blocked));
    batch.expiry_date=expiry;
  }
  return { medicineMap, batches, available };
}

export async function listCloudSaleBatches(medicineId: string, clinicId: string, storeId: string | null) {
  const { medicineMap, batches, available } = await loadAllocationStock([medicineId], clinicId, storeId, false);
  const medicine = medicineMap.get(medicineId);
  if (!medicine || medicine.is_active === false) throw new AppError(404, 'Medicine not found.');
  if (isRestricted(medicine)) return [];
  return batches.filter(batch => (available.get(batch.id) ?? 0) > 0)
    .filter(batch => Number(batch.sales_rate || batch.mrp) > 0 && Number(batch.sales_rate || batch.mrp) <= Number(batch.mrp))
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.id.localeCompare(b.id))
    .map(batch => ({
      id: batch.id,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      available_quantity: available.get(batch.id)!,
      mrp: Number(batch.mrp),
      selling_price: Number(batch.sales_rate || batch.mrp),
    }));
}

function isRestricted(medicine: { prescription_required?: boolean; is_schedule_h1?: boolean; schedule_classification?: string }) {
  return medicine.prescription_required || medicine.is_schedule_h1
    || (medicine.schedule_classification && medicine.schedule_classification !== 'NONE');
}

export async function allocateCloudSale(items: SaleInput[], clinicId: string, storeId: string | null, acceptPriceChanges = false, reviewRestricted = false) {
  const ids = [...new Set(items.map(item => item.medicine_id))].sort();
  const { medicineMap, batches, available } = await loadAllocationStock(ids, clinicId, storeId, true);
  const allocated: Array<SaleInput & {batch_id:string}> = [];
  for(const item of items) {
    const medicine=medicineMap.get(item.medicine_id);
    if(!medicine || medicine.is_active===false) throw new AppError(404,`Medicine not found: ${item.medicine_id}`,'MEDICINE_NOT_FOUND');
    if(isRestricted(medicine) && !reviewRestricted)
      throw new AppError(409,`Restricted dispensing is blocked for ${medicine.name} until the verified prescription and pharmacist workflow is available.`,'RESTRICTED_DISPENSING_BLOCKED');
    const manual=item.allocation_mode==='manual' ? item.batch_id : undefined;
    if(item.allocation_mode==='manual' && !manual) throw new AppError(400,'A manual batch must be selected');
    const candidates=batches.filter(batch=>batch.medicine_id===medicine.id).map(batch=>({...batch,available:available.get(batch.id)||0}));
    if(manual && !candidates.some(batch=>batch.id===manual || batch._local_id===manual))
      throw new AppError(400,'Selected batch does not belong to the selected medicine','BATCH_MEDICINE_MISMATCH');
    const manualId=manual ? candidates.find(batch=>batch.id===manual||batch._local_id===manual)?.id : undefined;
    for(const entry of allocateFefo(candidates,item.quantity,manualId)) {
      const batch=entry.batch;
      const price=Number(batch.sales_rate || batch.mrp || 0);
      if(!Number.isFinite(price) || price<=0 || price>Number(batch.mrp)) throw new AppError(409,'Batch selling price needs correction before checkout','INVALID_BATCH_PRICE');
      // The authoritative batch can have a different selling price when FEFO
      // spans batches. Require a fresh quote instead of charging an unreviewed total.
      if(!acceptPriceChanges && Money.toPaise(item.mrp)!==Money.toPaise(price)) throw new AppError(409,`Selling price changed for batch ${batch.batch_number}. Refresh the bill before confirming.`,'PRICE_CHANGED');
      if(!acceptPriceChanges && Number(item.gst_rate)!==Number(medicine.gst_rate||0)) throw new AppError(409,'Medicine GST rate changed. Refresh the bill.','TAX_RATE_CHANGED');
      allocated.push({...item,medicine_id:medicine.id,batch_id:batch.id,quantity:entry.quantity,mrp:price,gst_rate:Number(medicine.gst_rate||0),_local_id:undefined});
      available.set(batch.id,(available.get(batch.id)||0)-entry.quantity);
    }
  }
  return allocated;
}
