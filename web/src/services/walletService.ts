import api from '../lib/api';
export interface CoinPolicy {version:number;enabled:boolean;rate_bps:number;minimum_sale_paise:number;earning_cap_paise:number;redemption_limit_percent:number;expiry_days:number}
export interface WalletLot { id:string; issued_paise:number; remaining_paise:number; expires_at:string; issued_at:string; reason:string; status:'active'|'used'|'expired'|'revoked'|'adjustment' }
export interface WalletEntry { id:string; sequence:number; kind:'CREDIT'|'EARN'|'REDEEM'|'REFUND'|'REVOKE'|'EXPIRE'|'CLAWBACK'; amount_paise:number; balance_after_paise:number; expires_at:string; created_at:string; actor_id:string; actor_name?:string; reason:string; sale_id?:string; invoice_number?:string;debt_offset_paise?:number }
export interface WalletSnapshot { balance_paise:number;debt_paise:number;expiring_soon_paise:number;next_expiry:string|null;lots:WalletLot[];entries:WalletEntry[];total_entries:number;page:number;integrity_verified:boolean;default_validity_days:number;policy:CoinPolicy }
export const WalletService={
 async getPolicy(signal?:AbortSignal):Promise<CoinPolicy>{const r=await api.get('/wallet/settings',{signal});return r.data.data;},
 async get(customerId:string,page=1,signal?:AbortSignal):Promise<WalletSnapshot>{const r=await api.get(`/wallet/${encodeURIComponent(customerId)}`,{params:{page},signal});return r.data.data;},
 async savePolicy(body:CoinPolicy & {reason:string}){const r=await api.put('/wallet/settings',body,{'axios-retry':{retries:0}});return r.data.data as CoinPolicy;},
};
export const walletMoney=(paise:number)=>new Intl.NumberFormat('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2}).format(paise/100);
export const walletDate=(value:string)=>new Date(value).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
