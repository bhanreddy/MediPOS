import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../lib/appError';

export interface WalletAccount { id: string; clinic_id: string; customer_id: string; last_sequence: number; head_hash: string; head_mac: string }
export interface WalletEntry {
  id: string; account_id: string; sequence: number; kind: 'CREDIT'|'EARN'|'REDEEM'|'REFUND'|'REVOKE'|'EXPIRE'|'CLAWBACK';
  lot_id: string; amount_paise: number; balance_after_paise: number; expires_at: string;
  sale_id: string|null; operation_id: string; actor_id: string; reason: string;
  schema_version?:number; source_sale_total_paise?:number|null; source_external_paise?:number|null; source_returned_paise?:number|null; policy_version?:number|null; debt_offset_paise?:number;
  invoice_number?: string; actor_name?: string;
  created_at: string; previous_hash: string; hash: string;
}
export interface WalletLot { id: string; issued_paise: number; remaining_paise: number; expires_at: string; issued_at: string; reason: string; revoked: boolean }
export const GENESIS = '0'.repeat(64);
export const integrityError = () => new AppError(409, 'Nex Coins integrity check failed. Spending is blocked; contact the owner.', 'WALLET_INTEGRITY_FAILED');
const mac = (key: string, value: unknown) => createHmac('sha256', key).update(JSON.stringify(value)).digest('hex');
const equal = (a: string, b: string) => /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
export const headMac = (key: string, a: WalletAccount) => mac(key, ['wallet-head-v1',a.id,a.clinic_id,a.customer_id,a.last_sequence,a.head_hash]);
export const entryMac = (key: string, a: WalletAccount, e: WalletEntry) => mac(key, [
  `wallet-entry-v${e.schema_version||1}`,a.clinic_id,a.customer_id,e.id,e.account_id,e.sequence,e.kind,e.lot_id,e.amount_paise,e.balance_after_paise,e.expires_at,e.sale_id,e.operation_id,e.actor_id,e.reason,e.created_at,e.previous_hash,
  ...(Number(e.schema_version)>=2?[e.source_sale_total_paise??null,e.source_external_paise??null,...(Number(e.schema_version)>=3?[e.source_returned_paise??null]:[]),e.policy_version??null,e.debt_offset_paise||0]:[]),
]);
export const debtPaise = (lots: WalletLot[]) => Math.max(0,-lots.reduce((n,l)=>n+Math.min(0,l.remaining_paise),0));
export const availablePaise = (lots: WalletLot[], now: string) => Math.max(0,lots.filter(l => !l.revoked && l.expires_at > now && l.remaining_paise>0).reduce((n,l) => n + l.remaining_paise, 0)-debtPaise(lots));
function settleDebt(lots:WalletLot[],now:string){
 const donors=lots.filter(l=>!l.revoked&&l.expires_at>now&&l.remaining_paise>0).sort((a,b)=>a.expires_at.localeCompare(b.expires_at)||a.issued_at.localeCompare(b.issued_at)||a.id.localeCompare(b.id));
 for(const debt of lots.filter(l=>l.remaining_paise<0))for(const donor of donors){const amount=Math.min(-debt.remaining_paise,donor.remaining_paise);debt.remaining_paise+=amount;donor.remaining_paise-=amount;if(debt.remaining_paise===0)break;}
}
export function applyEntry(lots: WalletLot[], e: WalletEntry) {
  if (e.kind === 'CREDIT' || e.kind === 'EARN') {
    if (e.amount_paise <= 0 || lots.some(l=>l.id===e.lot_id)) throw integrityError();
    lots.push({id:e.lot_id,issued_paise:e.amount_paise,remaining_paise:e.amount_paise,expires_at:e.expires_at,issued_at:e.created_at,reason:e.reason,revoked:false});
  } else {
    const lot = lots.find(l=>l.id===e.lot_id);
    if (!lot || lot.expires_at !== e.expires_at || (e.kind === 'REFUND' ? e.amount_paise <= 0 : e.amount_paise >= 0)) throw integrityError();
    lot.remaining_paise += e.amount_paise;
    if ((lot.remaining_paise < 0 && !(['CLAWBACK','REFUND'].includes(e.kind))) || lot.remaining_paise > lot.issued_paise) throw integrityError();
    if (e.kind === 'REVOKE') lot.revoked = true;
  }
  if(Number(e.schema_version)>=2)settleDebt(lots,e.created_at);
}
export function verifyLedger(key: string, account: WalletAccount, entries: WalletEntry[]): WalletLot[] {
  if (!equal(account.head_mac,headMac(key,account)) || entries.length !== Number(account.last_sequence)) throw integrityError();
  const lots: WalletLot[] = [];
  let previous = GENESIS;
  for (const [index,e] of entries.entries()) {
    if (e.account_id !== account.id || e.sequence !== index+1 || e.previous_hash !== previous || !Number.isSafeInteger(e.amount_paise) || !equal(e.hash,entryMac(key,account,e))) throw integrityError();
    const debtBefore=debtPaise(lots);
    applyEntry(lots,e);
    if(Number(e.schema_version)>=2&&(e.debt_offset_paise||0)!==Math.max(0,debtBefore-debtPaise(lots)))throw integrityError();
    if (availablePaise(lots,e.created_at) !== e.balance_after_paise) throw integrityError();
    previous = e.hash;
  }
  if (previous !== account.head_hash) throw integrityError();
  return lots;
}
export function planRedemption(lots: WalletLot[], amount: number, now: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > availablePaise(lots,now)) throw new AppError(409, 'Nex Coins balance is insufficient or has expired', 'WALLET_INSUFFICIENT');
  let remaining = amount;
  return lots.filter(l=>!l.revoked && l.remaining_paise>0 && l.expires_at>now)
    .sort((a,b)=>a.expires_at.localeCompare(b.expires_at)||a.issued_at.localeCompare(b.issued_at)||a.id.localeCompare(b.id))
    .flatMap(l=>{const used=Math.min(remaining,l.remaining_paise);remaining-=used;return used?[{lot:l,amount:used}]:[];});
}
