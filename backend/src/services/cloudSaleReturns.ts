import { AppError } from '../lib/appError';
import { Money } from '../lib/money';
import { queryRaw } from '../lib/postgresDb';

export interface ReturnSelection {sale_item_id:string;batch_id?:string;quantity:number;reason?:string;restock?:boolean;_local_id?:string}
export function apportionPaise(total:number, weights:Array<{id:string;weight:number}>) {
  if(!Number.isSafeInteger(total)||total<0)throw new AppError(409,'Original invoice value cannot be verified');
  const sum=weights.reduce((n,item)=>n+item.weight,0);
  if(sum<=0)return new Map(weights.map(item=>[item.id,0]));
  const entries=weights.map(item=>{const product=BigInt(total)*BigInt(item.weight);return {...item,value:Number(product/BigInt(sum)),remainder:product%BigInt(sum)};});
  let residual=total-entries.reduce((n,item)=>n+item.value,0);
  for(const entry of [...entries].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1)){if(!residual)break;entry.value++;residual--;}
  return new Map(entries.map(item=>[item.id,item.value]));
}

export async function quoteCloudSaleReturn(clinicId:string, originalId:string, requested:ReturnSelection[]) {
 const [original]=await queryRaw('SELECT * FROM sales WHERE (id::text=? OR _local_id=?) AND clinic_id=? AND deleted_at IS NULL FOR UPDATE',[originalId,originalId,clinicId]);
 if(!original||original.is_return||original.status==='CANCELLED')throw new AppError(404,'Original sale not found','SALE_NOT_FOUND');
 const [voidRecord] = await queryRaw('SELECT reversal_id FROM sale_voids WHERE sale_id = ? AND clinic_id = ?', [original.id, clinicId]);
 if (voidRecord) throw new AppError(409, 'This invoice has been voided.', 'SALE_VOIDED');
 const items=await queryRaw('SELECT * FROM sale_items WHERE sale_id=? AND clinic_id=? AND deleted_at IS NULL ORDER BY id',[original.id,clinicId]);
 const allocations=await queryRaw('SELECT * FROM sale_batch_allocations WHERE sale_id=? AND deleted_at IS NULL ORDER BY id',[original.id]);
 const returned=await queryRaw(`SELECT ri.sale_item_id,ri.batch_id,COALESCE(SUM(ABS(ri.quantity)),0)::int AS quantity,COALESCE(SUM(ABS(ri.total)),0) AS refunded
  FROM sale_items ri JOIN sales rs ON rs.id=ri.sale_id WHERE rs.return_of=? AND rs.clinic_id=? AND rs.is_return=true AND rs.deleted_at IS NULL AND ri.deleted_at IS NULL GROUP BY ri.sale_item_id,ri.batch_id`,[original.id,clinicId]);
 const [prior]=await queryRaw('SELECT COALESCE(SUM(ABS(net_amount)),0) AS returned,COALESCE(SUM(wallet_redeemed_paise),0) AS wallet_returned FROM sales WHERE clinic_id=? AND return_of=? AND is_return=true AND deleted_at IS NULL',[clinicId,original.id]);
 const lineAmounts=apportionPaise(Money.toPaise(original.net_amount),items.map(item=>({id:item.id,weight:item.invoice_line_snapshot?.gross_paise ?? Money.toPaise(item.total)})));
 const options:Record<string,any>[]=[];
 for(const item of items){
  const itemAllocations=allocations.filter(allocation=>allocation.sale_item_id===item.id);
  const sources=itemAllocations.length?itemAllocations:item.batch_id?[{batch_id:item.batch_id,allocated_quantity:Number(item.quantity)}]:[];
  if(!sources.length)throw new AppError(409,'Original batch allocation is missing. A pharmacist must reconcile this invoice before a return.','RETURN_BATCH_UNVERIFIED');
  const batchAmounts=apportionPaise(lineAmounts.get(item.id)||0,sources.map(source=>({id:source.batch_id,weight:Number(source.allocated_quantity)})));
  for(const source of sources){
   const previous=returned.find(row=>row.sale_item_id===item.id&&row.batch_id===source.batch_id);
   const [batch]=await queryRaw('SELECT * FROM medicine_batches WHERE id=? AND clinic_id=?',[source.batch_id,clinicId]);
   const [medicine]=await queryRaw('SELECT name FROM medicines WHERE id=? AND clinic_id=?',[item.medicine_id,clinicId]);
   options.push({key:`${item.id}:${source.batch_id}`,sale_item_id:item.id,batch_id:source.batch_id,medicine_id:item.medicine_id,medicine_name:medicine?.name||'Medicine',
    batch_number:batch?.batch_number||'',expiry_date:batch?.expiry_date||'',sold_quantity:Number(source.allocated_quantity),returned_quantity:Number(previous?.quantity||0),
    remaining_quantity:Number(source.allocated_quantity)-Number(previous?.quantity||0),original_refund_paise:batchAmounts.get(source.batch_id)||0,previous_refund_paise:Money.toPaise(previous?.refunded||0),batch,item});
  }
 }
 const selected:Record<string,any>[]=[];const seen=new Set<string>();let total=0;
 for(const selection of requested){
  const candidates=options.filter(option=>(option.sale_item_id===selection.sale_item_id||option.item._local_id===selection.sale_item_id)&&(!selection.batch_id||option.batch_id===selection.batch_id));
  if(candidates.length!==1)throw new AppError(400,'Select the exact original invoice item and batch','RETURN_BATCH_REQUIRED');
  const source=candidates[0];
  if(seen.has(source.key))throw new AppError(400,'A return item and batch can only appear once');seen.add(source.key);
  if(!Number.isSafeInteger(selection.quantity)||selection.quantity<=0||selection.quantity>source.remaining_quantity)throw new AppError(400,`Return quantity exceeds unreturned quantity (${source.remaining_quantity}) for ${source.medicine_name}`,'INVALID_RETURN_QUANTITY');
  const cumulative=Number(BigInt(source.original_refund_paise)*BigInt(source.returned_quantity+selection.quantity)/BigInt(source.sold_quantity));
  const refund=Math.max(0,cumulative-source.previous_refund_paise);
  total+=refund;selected.push({...selection,...source,quantity:selection.quantity,reason:selection.reason||'Customer return',restock:selection.restock===true,refund_paise:refund});
 }
 if(total>Math.max(0,Money.toPaise(original.net_amount)-Money.toPaise(prior.returned)))throw new AppError(409,'Refund exceeds the remaining invoice value');
 const creditReduction=Math.min(Money.toPaise(original.balance_due||0),total);
 let walletRefund=0;
 const wallet=Number(original.wallet_redeemed_paise||0),net=Money.toPaise(original.net_amount);
 if(wallet>0&&net>0)walletRefund=Math.max(0,Number(BigInt(wallet)*BigInt(Math.min(net,Money.toPaise(prior.returned)+total))/BigInt(net))-Number(prior.wallet_returned));
 const external=Math.max(0,total-creditReduction-walletRefund);
 return {original,options,selected,prior,total_refund_paise:total,credit_reduction_paise:creditReduction,wallet_refund_paise:walletRefund,external_refund_paise:external};
}
