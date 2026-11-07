import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { postgresQuery, withPostgresTransaction } from '../../lib/postgresDb';
import { AppError } from '../../lib/appError';
import { GENESIS } from './walletLedger';
export interface CoinPolicy {
 version:number; enabled:boolean; rate_bps:number; minimum_sale_paise:number; earning_cap_paise:number;
 redemption_limit_percent:number; expiry_days:number;
}
type PolicyRow=CoinPolicy & {id:string;clinic_id:string;actor_id:string;reason:string;created_at:string;previous_hash:string;hash:string};
export const DEFAULT_COIN_POLICY:CoinPolicy={version:0,enabled:true,rate_bps:1000,minimum_sale_paise:0,earning_cap_paise:0,redemption_limit_percent:100,expiry_days:90};
export function walletSigningKey(){const key=process.env.WALLET_LEDGER_SECRET;if(!key||!/^[a-fA-F0-9]{64,}$/.test(key))throw new AppError(503,'Nex Coins are not configured. Contact the owner.');return key;}
function signature(p:PolicyRow){return createHmac('sha256',walletSigningKey()).update(JSON.stringify(['nex-coin-policy-v1',p.id,p.clinic_id,p.version,p.enabled,p.rate_bps,p.minimum_sale_paise,p.earning_cap_paise,p.redemption_limit_percent,p.expiry_days,p.actor_id,p.reason,p.created_at,p.previous_hash])).digest('hex');}
export async function getCoinPolicy(clinicId:string,version?:number):Promise<CoinPolicy>{
 walletSigningKey();
 const rows=await postgresQuery<PolicyRow>('SELECT * FROM nex_coin_policies WHERE clinic_id=$1 ORDER BY version',[clinicId]);
 let previous=GENESIS;
 for(const [i,raw] of rows.entries()){
  const row={...raw,minimum_sale_paise:Number(raw.minimum_sale_paise),earning_cap_paise:Number(raw.earning_cap_paise),created_at:new Date(raw.created_at).toISOString()};
  const actual=signature(row);
  if(row.version!==i+1||row.previous_hash!==previous||!/^[a-f0-9]{64}$/.test(row.hash)||!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(row.hash,'hex')))throw new AppError(409,'Nex Coins policy integrity check failed. Earning and redemption are blocked.','WALLET_INTEGRITY_FAILED');
  previous=row.hash;
 }
 if(version===0||!rows.length)return {...DEFAULT_COIN_POLICY};
 const row=version===undefined?rows[rows.length-1]:rows.find(r=>r.version===version);
 if(!row)throw new AppError(409,'The original Nex Coins earning rules could not be verified');
 return {version:row.version,enabled:row.enabled,rate_bps:row.rate_bps,minimum_sale_paise:Number(row.minimum_sale_paise),earning_cap_paise:Number(row.earning_cap_paise),redemption_limit_percent:row.redemption_limit_percent,expiry_days:row.expiry_days};
}
export async function setCoinPolicy(clinicId:string,actorId:string,input:CoinPolicy & {reason:string}){
 return (await withPostgresTransaction(async()=>{
  await postgresQuery('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`nex-coin-policy:${clinicId}`]);
  const current=await getCoinPolicy(clinicId);
  if(input.version!==current.version)throw new AppError(409,'Nex Coins settings changed. Refresh before saving again.');
  const [head]=await postgresQuery<{hash:string}>('SELECT hash FROM nex_coin_policies WHERE clinic_id=$1 ORDER BY version DESC LIMIT 1',[clinicId]);
  const row:PolicyRow={...input,id:randomUUID(),clinic_id:clinicId,version:current.version+1,actor_id:actorId,created_at:new Date().toISOString(),previous_hash:head?.hash||GENESIS,hash:''};
  row.hash=signature(row);
  await postgresQuery(`INSERT INTO nex_coin_policies(id,clinic_id,version,enabled,rate_bps,minimum_sale_paise,earning_cap_paise,redemption_limit_percent,expiry_days,actor_id,reason,created_at,previous_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[row.id,clinicId,row.version,row.enabled,row.rate_bps,row.minimum_sale_paise,row.earning_cap_paise,row.redemption_limit_percent,row.expiry_days,actorId,row.reason,row.created_at,row.previous_hash,row.hash]);
  return (await getCoinPolicy(clinicId));
 }));
}
export function calculateEarnedCoins(policy:CoinPolicy,salePaise:number,externalPaise:number){
 if(!policy.enabled||salePaise<policy.minimum_sale_paise)return 0;
 const earned=Number(BigInt(externalPaise)*BigInt(policy.rate_bps)/10000n);
 return policy.earning_cap_paise>0?Math.min(earned,policy.earning_cap_paise):earned;
}
