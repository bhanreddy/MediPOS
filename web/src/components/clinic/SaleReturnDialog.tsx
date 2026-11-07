import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import { Modal } from '../ui/Modal';
import { formatInr } from '../../lib/formatInr';

type Option={key:string;sale_item_id:string;batch_id:string;medicine_name:string;batch_number:string;expiry_date:string;sold_quantity:number;returned_quantity:number;remaining_quantity:number};
type Quote={total_refund_paise:number;credit_reduction_paise:number;wallet_refund_paise:number;external_refund_paise:number;refund_tenders?:Array<{tender_type:string;amount_paise:number}>};
const message=(error:any)=>error?.response?.data?.error?.message||error?.response?.data?.error||'Unable to complete the request. Your selections have been kept for retry.';
export async function printReturnDocument(id:string) {
 const popup=window.open('','_blank');
 if(!popup)throw new Error('Allow pop-ups to print the return document.');
 try {const response=await api.get(`/sales/${encodeURIComponent(id)}/invoice`,{responseType:'text'});popup.document.write(response.data);popup.document.close();popup.focus();popup.print();}
 catch(error){popup.close();throw error;}
}
export function SaleReturnDialog({saleId,canRestock,onClose,onComplete}:{saleId:string;canRestock:boolean;onClose:()=>void;onComplete:()=>void}) {
 const [invoice,setInvoice]=useState('');const [options,setOptions]=useState<Option[]>([]);
 const [quantities,setQuantities]=useState<Record<string,number>>({});const [restock,setRestock]=useState<Record<string,boolean>>({});
 const [reason,setReason]=useState('');const [method,setMethod]=useState('original');const [quote,setQuote]=useState<Quote|null>(null);
 const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [quoting,setQuoting]=useState(false);const [saving,setSaving]=useState(false);
 const [completed,setCompleted]=useState<{id:string;number:string}|null>(null);const identity=useRef({fingerprint:'',id:''});
 const selected=options.filter(option=>(quantities[option.key]||0)>0).map(option=>({sale_item_id:option.sale_item_id,batch_id:option.batch_id,quantity:quantities[option.key],reason:reason.trim()||'Customer return',restock:!!restock[option.key]}));
 const fingerprint=JSON.stringify({original_sale_id:saleId,refund_method:method,items:selected});
 useEffect(()=>{const controller=new AbortController();setLoading(true);api.get(`/sales/${encodeURIComponent(saleId)}/return-options`,{signal:controller.signal})
  .then(response=>{setInvoice(response.data.data.invoice.invoice_number);setOptions(response.data.data.items);})
  .catch(error=>{if(!controller.signal.aborted)setError(message(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[saleId]);
 useEffect(()=>{
  setQuote(null);if(!selected.length){setQuoting(false);return;}
  const controller=new AbortController();setQuoting(true);
  const timer=setTimeout(()=>{api.post('/sales/returns/quote',JSON.parse(fingerprint),{signal:controller.signal,'axios-retry':{retries:0}})
   .then(response=>{setQuote(response.data.data);setError('');}).catch(error=>{if(!controller.signal.aborted)setError(message(error));})
   .finally(()=>{if(!controller.signal.aborted)setQuoting(false);});},200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[fingerprint]);
 const submit=async()=>{
  if(!quote||saving||!reason.trim())return;
  if(identity.current.fingerprint!==fingerprint)identity.current={fingerprint,id:crypto.randomUUID()};
  setSaving(true);setError('');
  try {
   const response=await api.post('/sales/returns',{...JSON.parse(fingerprint),_local_id:identity.current.id,expected_refund_paise:quote.total_refund_paise,register_required:true},{'axios-retry':{retries:0}});
   const returned=response.data.data;setCompleted({id:returned.id,number:returned.credit_note.credit_note_number});onComplete();
  }catch(error){setError(message(error));}finally{setSaving(false);}
 };
 return <Modal isOpen onClose={()=>{if(!saving)onClose();}} title={completed?'Return recorded':`Return · ${invoice||'Loading invoice'}`}>
  {completed?<div className="space-y-4"><p>Credit note <strong>{completed.number}</strong> records this return and its refund.</p>
   <button className="rounded-lg bg-primary px-4 py-2 text-on-primary" onClick={()=>void printReturnDocument(completed.id).catch(error=>setError(error.message))}>Print credit note</button>
   <button className="ml-3 rounded-lg border border-border px-4 py-2" onClick={onClose}>Close</button></div>:
  <div className="space-y-4">
   <p className="text-sm text-muted">Select original invoice items and batches. Refunds include the original discounts. Returned medicines stay out of saleable stock unless an owner or pharmacist approves restocking.</p>
   {loading?<p>Loading original invoice…</p>:<>
    <button type="button" className="text-sm font-semibold text-primary" disabled={saving} onClick={()=>setQuantities(Object.fromEntries(options.map(option=>[option.key,option.remaining_quantity])))}>Select all unreturned units</button>
    <div className="max-h-80 space-y-3 overflow-auto">
    {options.map(option=><div key={option.key} className="rounded-lg border border-border p-3">
     <div className="flex items-start justify-between gap-3"><label className="flex gap-3"><input type="checkbox" aria-label={`Return ${option.medicine_name}, batch ${option.batch_number}`} disabled={saving||option.remaining_quantity===0} checked={(quantities[option.key]||0)>0} onChange={event=>setQuantities(previous=>({...previous,[option.key]:event.target.checked?1:0}))}/>
      <span><strong>{option.medicine_name}</strong><span className="block text-xs text-muted">Batch {option.batch_number} · Expiry {String(option.expiry_date).slice(0,10)}<br/>{option.sold_quantity} sold · {option.returned_quantity} returned · {option.remaining_quantity} returnable</span></span></label>
     <label className="text-xs">Units<input className="ml-2 w-20 rounded border border-border bg-surface p-2 text-foreground" type="number" min={0} max={option.remaining_quantity} step={1} aria-label={`Return quantity for batch ${option.batch_number}`} disabled={saving||!option.remaining_quantity} value={quantities[option.key]||0} onChange={event=>setQuantities(previous=>({...previous,[option.key]:Math.min(option.remaining_quantity,Math.max(0,Math.trunc(Number(event.target.value)||0)))}))}/></label></div>
     <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={!!restock[option.key]} disabled={!canRestock||saving||!(quantities[option.key]>0)} onChange={event=>setRestock(previous=>({...previous,[option.key]:event.target.checked}))}/>Approve restocking {canRestock?'after checking the returned batch':'(pharmacist or owner required)'}</label>
    </div>)}
    {!options.some(option=>option.remaining_quantity>0)&&<p>All units on this invoice have already been returned.</p>}
    </div>
    <label className="block text-sm">Return reason<textarea className="mt-1 block w-full rounded-lg border border-border bg-surface p-2 text-foreground" maxLength={1000} required disabled={saving} value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <label className="block text-sm">Refund method<select className="ml-3 rounded-lg border border-border bg-surface p-2 text-foreground" value={method} disabled={saving} onChange={event=>setMethod(event.target.value)}><option value="original">Original payment method</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label>
    {quoting?<p>Calculating the refund…</p>:quote&&<dl className="grid grid-cols-2 gap-2 rounded-lg bg-surface-elevated p-4 text-sm">
      <dt>Return value</dt><dd className="text-right">{formatInr(quote.total_refund_paise/100,2)}</dd>
      <dt>Outstanding reduced</dt><dd className="text-right">{formatInr(quote.credit_reduction_paise/100,2)}</dd>
      <dt>Nex Coins restored</dt><dd className="text-right">{formatInr(quote.wallet_refund_paise/100,2)}</dd>
      <dt className="font-bold">Refund to customer</dt><dd className="text-right font-bold">{formatInr(quote.external_refund_paise/100,2)}</dd>
    </dl>}
    {!!quote?.refund_tenders?.length && <ul aria-label="Refund allocations" className="space-y-1 text-sm">
      {quote.refund_tenders.map((tender, index) => <li key={index}>{tender.tender_type} · {formatInr(tender.amount_paise / 100, 2)}</li>)}
    </ul>}
    <button type="button" className="rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50" disabled={saving||quoting||!quote||!reason.trim()||!selected.length} onClick={()=>void submit()}>{saving?'Recording return…':'Confirm return and record refund'}</button>
   </>}
  </div>}
  {error&&<p role="alert" className="mt-3 text-sm text-danger">{String(error)}</p>}
 </Modal>;
}
