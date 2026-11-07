import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../lib/appError';
import { Money } from '../lib/money';
import { queryRaw, localMutate, withPostgresTransaction } from '../lib/postgresDb';
import { cloudDocumentNumber } from './cloudDocumentNumber';

export async function supplierInvoiceBalance(supplierId: string, clinicId: string) {
  const [row]=await queryRaw(`SELECT
    COALESCE((SELECT SUM(GREATEST(0,net_amount-COALESCE(paid_amount,0)-supplier_credit_paise/100.0)) FROM purchases WHERE supplier_id=? AND clinic_id=? AND deleted_at IS NULL),0)
    + COALESCE((SELECT SUM(balance_due_paise)/100.0 FROM purchase_invoices WHERE supplier_id=? AND status='POSTED' AND deleted_at IS NULL),0)
    + COALESCE((SELECT legacy_opening_paise/100.0 FROM supplier_balance_reconciliation WHERE supplier_id=?),0)
    - COALESCE((SELECT SUM(unallocated_paise)/100.0 FROM supplier_return_credits WHERE supplier_id=? AND clinic_id=?),0) AS outstanding`,[supplierId,clinicId,supplierId,supplierId,supplierId,clinicId]);
  return Money.round2(Number(row.outstanding));
}

export interface SupplierCloudPaymentInput {
  clinicId:string; userId:string; supplierId:string; requestId:string;
  amount?:number; targetPaidAmount?:number; purchaseId?:string;
  mode:string; note?:string; reference?:string;
  allocations?:Array<{invoiceId:string;amountPaise:number}>;
}
export async function recordSupplierCloudPayment(input:SupplierCloudPaymentInput) {
 return withPostgresTransaction(async()=>{
  if(!input.requestId || input.requestId.length>160) throw new AppError(428,'A payment request identifier is required','IDEMPOTENCY_KEY_REQUIRED');
  await queryRaw('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`supplier-payment:${input.clinicId}:${input.requestId}`]);
  const hash=createHash('sha256').update(JSON.stringify({supplier:input.supplierId,amount:input.amount,target:input.targetPaidAmount,purchase:input.purchaseId,mode:input.mode,note:input.note||'',reference:input.reference||'',allocations:input.allocations||[]})).digest('hex');
  // One party lock establishes a consistent ordering for account and invoice payments.
  const [supplier]=await queryRaw('SELECT * FROM suppliers WHERE (id::text=? OR _local_id=?) AND clinic_id=? AND deleted_at IS NULL FOR UPDATE',[input.supplierId,input.supplierId,input.clinicId]);
  if(!supplier)throw new AppError(404,'Supplier not found');
  const [previous]=await queryRaw('SELECT * FROM supplier_payments WHERE clinic_id=? AND idempotency_key=?',[input.clinicId,input.requestId]);
  if(previous){
    if(previous.request_hash!==hash)throw new AppError(409,'Payment identifier already used for different details','IDEMPOTENCY_CONFLICT');
    return {supplier,payment:previous,allocations:await queryRaw('SELECT * FROM supplier_payment_allocations WHERE payment_id=?',[previous.id]),replayed:true};
  }
  await allocateSupplierReturnCredits(supplier.id,input.clinicId);
  const purchases=await queryRaw('SELECT * FROM purchases WHERE supplier_id=? AND clinic_id=? AND deleted_at IS NULL ORDER BY id FOR UPDATE',[supplier.id,input.clinicId]);
  const enterprise=await queryRaw("SELECT * FROM purchase_invoices WHERE supplier_id=? AND status='POSTED' AND deleted_at IS NULL ORDER BY id FOR UPDATE",[supplier.id]);
  const purchase=input.purchaseId ? purchases.find(row=>row.id===input.purchaseId||row._local_id===input.purchaseId) : null;
  if(input.purchaseId&&!purchase)throw new AppError(404,'Purchase invoice not found');
  const amountPaise=input.targetPaidAmount!==undefined
    ? Money.toPaise(input.targetPaidAmount)-Money.toPaise(purchase?.paid_amount||0) : Money.toPaise(input.amount||0);
  if(!Number.isSafeInteger(amountPaise)||amountPaise<=0)throw new AppError(409,'Payment must increase the paid amount','INVALID_PAYMENT_AMOUNT');
  if(purchase&&amountPaise>Money.toPaise(purchase.net_amount)-Money.toPaise(purchase.paid_amount||0)-Number(purchase.supplier_credit_paise||0))throw new AppError(409,'Payment exceeds invoice outstanding');
  const before=await supplierInvoiceBalance(supplier.id,input.clinicId);
  if(amountPaise>Money.toPaise(before))throw new AppError(409,'Payment exceeds the outstanding balance');
  const candidates=[...(purchase?[purchase]:purchases).map(row=>({row,kind:'purchase' as const,due:Money.toPaise(row.net_amount)-Money.toPaise(row.paid_amount||0)-Number(row.supplier_credit_paise||0)})),
    ...(!purchase?enterprise.map(row=>({row,kind:'enterprise' as const,due:Number(row.balance_due_paise)})):[])]
    .filter(entry=>entry.due>0).sort((a,b)=>String(a.row.created_at).localeCompare(String(b.row.created_at))||a.row.id.localeCompare(b.row.id));
  const paymentId=randomUUID(),allocations:Record<string,any>[]=[];let remaining=amountPaise;
  if(input.allocations?.length){
    const seen=new Set<string>();
    for(const allocation of input.allocations){
      const target=candidates.find(entry=>entry.kind==='enterprise'&&(entry.row.id===allocation.invoiceId||entry.row._local_id===allocation.invoiceId));
      if(!target||seen.has(target.row.id)||!Number.isSafeInteger(allocation.amountPaise)||allocation.amountPaise<=0||allocation.amountPaise>target.due)throw new AppError(409,'Invalid invoice payment allocation');
      seen.add(target.row.id);
    }
    if(input.allocations.reduce((sum,allocation)=>sum+allocation.amountPaise,0)!==amountPaise)throw new AppError(409,'Payment allocations must equal the payment amount');
  }
  for(const target of candidates){
    if(!remaining)break;
    const explicit=input.allocations?.length?input.allocations.find(allocation=>allocation.invoiceId===target.row.id||allocation.invoiceId===target.row._local_id)?.amountPaise:undefined;
    const applied=input.allocations?.length?(explicit||0):Math.min(remaining,target.due);
    if(!applied)continue;
    const balance=target.due-applied;
    await localMutate({table:target.kind==='purchase'?'purchases':'purchase_invoices',operation:'UPDATE',data:{_local_id:target.row._local_id||target.row.id,
      ...(target.kind==='purchase'?{paid_amount:Money.toRupees(Money.toPaise(target.row.paid_amount||0)+applied),payment_status:balance?'partial':'paid'}:
        {paid_amount_paise:Number(target.row.paid_amount_paise||0)+applied,balance_due_paise:balance,payment_status:balance?'PARTIALLY_PAID':'PAID'})}});
    allocations.push({id:randomUUID(),payment_id:paymentId,invoice_id:target.kind==='enterprise'?target.row.id:null,purchase_id:target.kind==='purchase'?target.row.id:null,allocated_amount_paise:applied});
    remaining-=applied;
  }
  if(remaining){
    const [opening]=await queryRaw('SELECT * FROM supplier_balance_reconciliation WHERE supplier_id=? FOR UPDATE',[supplier.id]);
    if(!opening||remaining>Number(opening.legacy_opening_paise))throw new AppError(409,'Payment cannot be allocated to recorded invoices');
    await queryRaw('UPDATE supplier_balance_reconciliation SET legacy_opening_paise=legacy_opening_paise-? WHERE supplier_id=?',[remaining,supplier.id]);
  }
  const [clinic]=await queryRaw('SELECT organization_id FROM clinics WHERE id=?',[input.clinicId]);
  const organizationId=supplier.organization_id||clinic?.organization_id||null;
  const number=await cloudDocumentNumber(input.clinicId,'PAY');
  const payment=await localMutate({table:'supplier_payments',operation:'INSERT',data:{id:paymentId,clinic_id:input.clinicId,organization_id:organizationId,supplier_id:supplier.id,
    payment_number:number,payment_date:new Date().toISOString().slice(0,10),payment_mode:input.mode,reference_number:input.reference||null,
    amount_paise:amountPaise,unallocated_paise:0,notes:input.note||null,recorded_by:input.userId,idempotency_key:input.requestId,request_hash:hash}});
  for(const allocation of allocations)await localMutate({table:'supplier_payment_allocations',operation:'INSERT',data:allocation});
  const outstanding=await supplierInvoiceBalance(supplier.id,input.clinicId);
  await localMutate({table:'supplier_payable_ledger',operation:'INSERT',data:{id:randomUUID(),clinic_id:input.clinicId,organization_id:organizationId,supplier_id:supplier.id,
    transaction_type:'PAYMENT',reference_id:paymentId,reference_number:number,purchase_id:purchase?.id||null,
    debit_paise:amountPaise,credit_paise:0,balance_after_paise:Money.toPaise(outstanding),notes:input.note||null,performed_by:input.userId}});
  const updated=await localMutate({table:'suppliers',operation:'UPDATE',data:{_local_id:supplier._local_id||supplier.id,outstanding_balance:outstanding}});
  return {supplier:updated,payment,allocations,replayed:false};
 });
}

/** The caller holds the supplier lock. Credits remain traceable even if every invoice was paid. */
export async function allocateSupplierReturnCredits(supplierId:string,clinicId:string) {
 const credits=await queryRaw('SELECT * FROM supplier_return_credits WHERE supplier_id=? AND clinic_id=? AND unallocated_paise>0 ORDER BY created_at,id FOR UPDATE',[supplierId,clinicId]);
 if(!credits.length)return;
 const purchases=await queryRaw('SELECT * FROM purchases WHERE supplier_id=? AND clinic_id=? AND deleted_at IS NULL ORDER BY id FOR UPDATE',[supplierId,clinicId]);
 const invoices=await queryRaw("SELECT * FROM purchase_invoices WHERE supplier_id=? AND status='POSTED' AND deleted_at IS NULL ORDER BY id FOR UPDATE",[supplierId]);
 const targets=[...purchases.map(row=>({row,legacy:true,due:Money.toPaise(row.net_amount)-Money.toPaise(row.paid_amount||0)-Number(row.supplier_credit_paise||0)})),
  ...invoices.map(row=>({row,legacy:false,due:Number(row.balance_due_paise)}))].filter(target=>target.due>0).sort((a,b)=>String(a.row.created_at).localeCompare(String(b.row.created_at))||a.row.id.localeCompare(b.row.id));
 for(const credit of credits){
  let remaining=Number(credit.unallocated_paise);
  for(const target of targets){
   if(!remaining)break;
   const applied=Math.min(remaining,target.due);if(!applied)continue;
   target.due-=applied;remaining-=applied;target.row.supplier_credit_paise=Number(target.row.supplier_credit_paise||0)+applied;
   await localMutate({table:target.legacy?'purchases':'purchase_invoices',operation:'UPDATE',data:{_local_id:target.row._local_id||target.row.id,supplier_credit_paise:target.row.supplier_credit_paise,
    ...(target.legacy?{payment_status:target.due?'partial':'paid'}:{payment_status:target.due?'PARTIALLY_PAID':'PAID',balance_due_paise:target.due})}});
   await queryRaw('INSERT INTO supplier_return_credit_allocations(credit_id,purchase_id,invoice_id,amount_paise) VALUES(?,?,?,?)',[credit.id,target.legacy?target.row.id:null,target.legacy?null:target.row.id,applied]);
  }
  await queryRaw('UPDATE supplier_return_credits SET unallocated_paise=? WHERE id=?',[remaining,credit.id]);
 }
}
