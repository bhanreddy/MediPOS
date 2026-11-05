import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import { WalletService, type CoinPolicy } from '../../services/walletService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { LoadError } from '../ui/ListFeedback';
export function NexCoinRules({policy}:{policy?:CoinPolicy}){
 const owner=useAuth(s=>s.role==='OWNER'),scope=useAuth(s=>`${s.user?.id}:${s.clinic_id}`),client=useQueryClient(),formId=useId(),busy=useRef(false);
 const query=useQuery({queryKey:['nex-coin-policy',scope],queryFn:({signal})=>WalletService.getPolicy(signal),enabled:owner&&!policy,retry:false});
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<CoinPolicy|null>(null),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 async function reload(){try{setDraft(await WalletService.getPolicy());setError('');}catch{setError('Could not reload Nex Coins rules. Please retry.');}}
 async function save(){
  if(!draft||busy.current)return;
  if(reason.trim().length<3){setError('Enter a reason for changing the earning rules.');return;}
  busy.current=true;setSaving(true);setError('');
  try{await WalletService.savePolicy({...draft,reason:reason.trim()});setOpen(false);await Promise.all([client.invalidateQueries({queryKey:['customer-wallet']}),client.invalidateQueries({queryKey:['nex-coin-policy']})]);toast.success('Nex Coins rules saved');}
  catch(e:unknown){setError((e as {response?:{data?:{error?:{message?:string}}}})?.response?.data?.error?.message||'Could not confirm the settings update. Reload the current rules before retrying.');}
  finally{busy.current=false;setSaving(false);}
 }
 if(!owner)return null;
 return <><Button size="sm" variant="secondary" disabled={!policy&&query.isPending} onClick={()=>{setDraft(policy||query.data||null);setReason('');setError('');setOpen(true)}}><Settings2 size={15} aria-hidden/>Nex Coins rules</Button>
 <Modal isOpen={open} onClose={()=>{if(!saving)setOpen(false)}} title="Nex Coins earning & redemption rules" footer={draft?<><Button variant="ghost" disabled={saving} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form={formId} isLoading={saving}>Save rules</Button></>:undefined}>
  {!draft?<LoadError onRetry={()=>void reload()}/>:<form id={formId} onSubmit={e=>{e.preventDefault();void save()}} className="space-y-4">
   <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.enabled} disabled={saving} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>Automatically earn Nex Coins</label>
   <Input label="Earning rate (%)" type="number" min={5} max={10} step={0.1} required value={draft.rate_bps/100} disabled={saving} onChange={e=>setDraft({...draft,rate_bps:Math.round(Number(e.target.value)*100)})}/>
   <Input label="Minimum sale amount to earn (₹)" type="number" min={0} step={0.01} required value={draft.minimum_sale_paise/100} disabled={saving} onChange={e=>setDraft({...draft,minimum_sale_paise:Math.round(Number(e.target.value)*100)})}/>
   <Input label="Maximum Nex Coins earned per bill (0 = no cap)" type="number" min={0} step={0.01} required value={draft.earning_cap_paise/100} disabled={saving} onChange={e=>setDraft({...draft,earning_cap_paise:Math.round(Number(e.target.value)*100)})}/>
   <Input label="Maximum bill payable with Nex Coins (%)" type="number" min={0} max={100} step={1} required value={draft.redemption_limit_percent} disabled={saving} onChange={e=>setDraft({...draft,redemption_limit_percent:Number(e.target.value)})}/>
   <Input label="New coins validity (days)" type="number" min={1} max={365} step={1} required value={draft.expiry_days} disabled={saving} onChange={e=>setDraft({...draft,expiry_days:Number(e.target.value)})}/>
   <p className="text-xs text-muted">Future earnings use these rules. Existing award deadlines stay unchanged. Coins cannot be added manually.</p>
   <Input label="Reason for rule change" required minLength={3} maxLength={500} value={reason} disabled={saving} onChange={e=>setReason(e.target.value)}/>
   <p className="text-xs text-muted">Rules version {draft.version}. Changes are recorded in the audit ledger.</p>
   {error&&<div role="alert" className="space-y-2 text-sm text-danger"><p>{error}</p><Button variant="ghost" size="sm" onClick={()=>void reload()}>Reload current rules</Button></div>}
  </form>}
 </Modal></>;
}
