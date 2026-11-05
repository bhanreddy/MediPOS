import { createHash, randomUUID } from 'node:crypto';
import { postgresQuery, withPostgresTransaction } from '../../lib/postgresDb';
import { AppError } from '../../lib/appError';
import { calculateEarnedCoins, getCoinPolicy, type CoinPolicy } from './coinPolicy';
import { applyEntry, availablePaise, debtPaise, entryMac, GENESIS, headMac, planRedemption, verifyLedger, type WalletAccount, type WalletEntry, type WalletLot } from './walletLedger';

type Context = { clinicId: string; customerId: string; actorId: string };
type State = { account: WalletAccount; entries: WalletEntry[]; lots: WalletLot[]; key: string; now: string };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (date: string | Date) => new Date(date).toISOString();
function key() {
  const value = process.env.WALLET_LEDGER_SECRET;
  if (!value || !/^[a-fA-F0-9]{64,}$/.test(value)) throw new AppError(503,'Nex Coins are not configured. Contact the owner.','WALLET_NOT_CONFIGURED');
  return value;
}
async function load(context: Context, create: boolean): Promise<State | null> {
  const secret = key();
  const [customer] = await postgresQuery('SELECT id FROM customers WHERE (id::text=$1 OR _local_id=$1) AND clinic_id=$2 AND deleted_at IS NULL', [context.customerId,context.clinicId]);
  if (!customer) throw new AppError(404,'Customer not found');
  if (create) {
    const account: WalletAccount = {id:randomUUID(),clinic_id:context.clinicId,customer_id:customer.id,last_sequence:0,head_hash:GENESIS,head_mac:''};
    account.head_mac = headMac(secret,account);
    await postgresQuery('INSERT INTO promo_wallet_accounts(id,clinic_id,customer_id,head_hash,head_mac) VALUES($1,$2,$3,$4,$5) ON CONFLICT(clinic_id,customer_id) DO NOTHING',[account.id,account.clinic_id,account.customer_id,account.head_hash,account.head_mac]);
  }
  const [account] = await postgresQuery<WalletAccount>(`SELECT * FROM promo_wallet_accounts WHERE clinic_id=$1 AND customer_id=$2 ${create?'FOR UPDATE':'FOR SHARE'}`,[context.clinicId,customer.id]);
  if (!account) return null;
  const raw = await postgresQuery<WalletEntry>('SELECT l.*,s.invoice_number,u.full_name AS actor_name FROM promo_wallet_ledger l LEFT JOIN sales s ON s.id=l.sale_id AND s.clinic_id=$2 LEFT JOIN users u ON u.id=l.actor_id WHERE l.account_id=$1 ORDER BY l.sequence',[account.id,context.clinicId]);
  const entries = raw.map(e=>({...e,sequence:Number(e.sequence),amount_paise:Number(e.amount_paise),balance_after_paise:Number(e.balance_after_paise),source_sale_total_paise:e.source_sale_total_paise==null?null:Number(e.source_sale_total_paise),source_external_paise:e.source_external_paise==null?null:Number(e.source_external_paise),source_returned_paise:Number(e.schema_version)>=3?(e.source_returned_paise==null?null:Number(e.source_returned_paise)):0,debt_offset_paise:Number(e.debt_offset_paise||0),created_at:iso(e.created_at),expires_at:iso(e.expires_at)}));
  const lots = verifyLedger(secret,account,entries);
  const [clock] = await postgresQuery<{now:Date}>('SELECT clock_timestamp() AS now');
  return {account,entries,lots,key:secret,now:iso(clock.now)};
}
async function operation(state: State, operationKey: string, action: string, payload: unknown) {
  const hash = digest([action,payload]);
  const [existing] = await postgresQuery('SELECT * FROM promo_wallet_operations WHERE account_id=$1 AND operation_key=$2',[state.account.id,operationKey]);
  if (existing) {
    if (existing.payload_hash !== hash || existing.action !== action) throw new AppError(409,'This request identifier has already been used for different wallet details','WALLET_REPLAY_MISMATCH');
    return {id:existing.id as string,replayed:true};
  }
  const id = randomUUID();
  await postgresQuery('INSERT INTO promo_wallet_operations(id,account_id,operation_key,payload_hash,action) VALUES($1,$2,$3,$4,$5)',[id,state.account.id,operationKey,hash,action]);
  return {id,replayed:false};
}
async function append(state: State, input: Omit<WalletEntry,'id'|'account_id'|'sequence'|'balance_after_paise'|'previous_hash'|'hash'|'created_at'>) {
  const entry: WalletEntry = {...input,id:randomUUID(),account_id:state.account.id,sequence:Number(state.account.last_sequence)+1,balance_after_paise:0,previous_hash:state.account.head_hash,hash:'',created_at:state.now,schema_version:3,debt_offset_paise:0};
  const previousDebt=debtPaise(state.lots);
  applyEntry(state.lots,entry);
  entry.debt_offset_paise=Math.max(0,previousDebt-debtPaise(state.lots));
  entry.balance_after_paise = availablePaise(state.lots,state.now);
  entry.hash = entryMac(state.key,state.account,entry);
  await postgresQuery(`INSERT INTO promo_wallet_ledger(id,account_id,sequence,kind,lot_id,amount_paise,balance_after_paise,expires_at,sale_id,operation_id,actor_id,reason,created_at,previous_hash,hash,schema_version,source_sale_total_paise,source_external_paise,policy_version,debt_offset_paise,source_returned_paise)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,[entry.id,entry.account_id,entry.sequence,entry.kind,entry.lot_id,entry.amount_paise,entry.balance_after_paise,entry.expires_at,entry.sale_id,entry.operation_id,entry.actor_id,entry.reason,entry.created_at,entry.previous_hash,entry.hash,3,entry.source_sale_total_paise??null,entry.source_external_paise??null,entry.policy_version??null,entry.debt_offset_paise||0,entry.source_returned_paise??null]);
  state.account.last_sequence=entry.sequence;state.account.head_hash=entry.hash;state.account.head_mac=headMac(state.key,state.account);state.entries.push(entry);
  await postgresQuery('UPDATE promo_wallet_accounts SET last_sequence=$1,head_hash=$2,head_mac=$3 WHERE id=$4',[entry.sequence,entry.hash,state.account.head_mac,state.account.id]);
}
async function expire(state: State, actor: string) {
  for (const lot of state.lots.filter(l=>l.remaining_paise>0 && l.expires_at<=state.now)) {
    const op = await operation(state,`expire:${lot.id}:${state.account.last_sequence}`,'expire',[lot.id,lot.remaining_paise]);
    await append(state,{kind:'EXPIRE',lot_id:lot.id,amount_paise:-lot.remaining_paise,expires_at:lot.expires_at,sale_id:null,operation_id:op.id,actor_id:actor,reason:'Nex Coins deadline passed'});
  }
}
function snapshot(state: State | null, page=1) {
  if (!state) return {debt_paise:0,balance_paise:0,expiring_soon_paise:0,next_expiry:null,lots:[],entries:[],total_entries:0,page,integrity_verified:true,default_validity_days:90};
  const available = state.lots.filter(l=>!l.revoked&&l.remaining_paise>0&&l.expires_at>state.now).sort((a,b)=>a.expires_at.localeCompare(b.expires_at));
  const soon = new Date(Date.parse(state.now)+7*86400000).toISOString();
  return {debt_paise:debtPaise(state.lots),balance_paise:availablePaise(state.lots,state.now),expiring_soon_paise:available.filter(l=>l.expires_at<=soon).reduce((n,l)=>n+l.remaining_paise,0),next_expiry:available[0]?.expires_at||null,
    lots:state.lots.map(l=>({...l,status:l.remaining_paise<0?'adjustment':l.revoked?'revoked':l.expires_at<=state.now?'expired':l.remaining_paise===0?'used':'active'})).reverse(),
    entries:[...state.entries].reverse().slice((page-1)*25,page*25),total_entries:state.entries.length,page,integrity_verified:true,default_validity_days:90};
}
export const WalletService = {
  async get(context: Context,page=1) { return withPostgresTransaction(async()=>{const policy=await getCoinPolicy(context.clinicId);return {...snapshot(await load(context,false),page),default_validity_days:policy.expiry_days,policy};}); },
  async earn(context:Context,saleTotalPaise:number,externalPaise:number,saleId:string,suppliedPolicy?:CoinPolicy){
    return withPostgresTransaction(async()=>{
      const policy=suppliedPolicy||await getCoinPolicy(context.clinicId);
      const state=(await load(context,true))!;
      const previous=state.entries.find(e=>e.kind==='EARN'&&e.sale_id===saleId);
      if(previous){if((previous.source_sale_total_paise||0)+(previous.source_returned_paise||0)!==saleTotalPaise||previous.source_external_paise!==externalPaise)throw new AppError(409,'Nex Coins earning request does not match the recorded bill');return previous.amount_paise;}
      const [returns]=await postgresQuery('SELECT COALESCE(SUM(net_amount),0) AS returned FROM sales WHERE clinic_id=$1 AND return_of=$2 AND is_return=true AND deleted_at IS NULL',[context.clinicId,saleId]);
      const returnedPaise=Math.min(saleTotalPaise,Math.round(Number(returns.returned)*100));
      const eligibleSale=Math.max(0,saleTotalPaise-returnedPaise);
      const amount=calculateEarnedCoins(policy,eligibleSale,Math.min(eligibleSale,externalPaise));
      if(amount<=0)return 0;
      const op=await operation(state,`earn:${saleId}`,'credit',[saleTotalPaise,externalPaise,amount,policy.version]);
      if(!op.replayed){
        await expire(state,context.actorId);
        await append(state,{kind:'EARN',lot_id:randomUUID(),amount_paise:amount,expires_at:new Date(Date.parse(state.now)+policy.expiry_days*86400000).toISOString(),sale_id:saleId,operation_id:op.id,actor_id:context.actorId,reason:`Earned ${policy.rate_bps/100}% Nex Coins on paid sale`,source_sale_total_paise:eligibleSale,source_external_paise:externalPaise,source_returned_paise:returnedPaise,policy_version:policy.version});
      }
      return amount;
    });
  },
  async reverseEarnings(context:Context,originalSaleId:string,returnSaleId:string,cumulativeReturnedPaise:number){
    return withPostgresTransaction(async()=>{
      const [hasEarned]=await postgresQuery("SELECT l.id FROM promo_wallet_ledger l JOIN promo_wallet_accounts a ON a.id=l.account_id WHERE a.clinic_id=$1 AND l.sale_id=$2 AND l.kind='EARN' LIMIT 1",[context.clinicId,originalSaleId]);
      if(!hasEarned)return 0;
      const state=(await load(context,true))!;
      const earned=state.entries.find(e=>e.kind==='EARN'&&e.sale_id===originalSaleId);
      if(!earned||!earned.source_sale_total_paise)return 0;
      const op=await operation(state,`clawback:${returnSaleId}`,'revoke',[originalSaleId,cumulativeReturnedPaise]);
      if(op.replayed)return 0;
      await expire(state,context.actorId);
      const originalPolicy=await getCoinPolicy(context.clinicId,earned.policy_version||0);
      const refundedSinceEarning=Math.max(0,cumulativeReturnedPaise-Number(earned.source_returned_paise||0));
      const remainingSale=Math.max(0,earned.source_sale_total_paise-refundedSinceEarning);
      const remainingExternal=Number(BigInt(earned.source_external_paise||0)*BigInt(remainingSale)/BigInt(earned.source_sale_total_paise));
      const target=Math.max(0,earned.amount_paise-calculateEarnedCoins(originalPolicy,remainingSale,remainingExternal));
      const cancelled=state.entries.filter(e=>e.lot_id===earned.lot_id&&['EXPIRE','REVOKE','CLAWBACK'].includes(e.kind)).reduce((n,e)=>n-e.amount_paise,0);
      const amount=Math.max(0,target-cancelled);
      if(amount>0)await append(state,{kind:'CLAWBACK',lot_id:earned.lot_id,amount_paise:-amount,expires_at:earned.expires_at,sale_id:returnSaleId,operation_id:op.id,actor_id:context.actorId,reason:'Nex Coins earning reversed for returned purchase'});
      return amount;
    });
  },
  async issue(context: Context,input:{amountPaise:number;validityDays:number;reason:string;requestId:string}) {
    return withPostgresTransaction(async()=>{
      if (!Number.isSafeInteger(input.amountPaise)||input.amountPaise<1||input.amountPaise>10000000||!Number.isInteger(input.validityDays)||input.validityDays<1||input.validityDays>365) throw new AppError(400,'Invalid promotional credit amount or validity');
      const state=(await load(context,true))!;
      const op=await operation(state,input.requestId,'credit',[input.amountPaise,input.validityDays,input.reason,context.actorId]);
      if (!op.replayed) {
        await expire(state,context.actorId);
        await append(state,{kind:'CREDIT',lot_id:randomUUID(),amount_paise:input.amountPaise,expires_at:new Date(Date.parse(state.now)+input.validityDays*86400000).toISOString(),sale_id:null,operation_id:op.id,actor_id:context.actorId,reason:input.reason});
      }
      return snapshot(state);
    });
  },
  async revoke(context: Context,input:{lotId:string;reason:string;requestId:string}) {
    return withPostgresTransaction(async()=>{
      const state=(await load(context,true))!;
      const op=await operation(state,input.requestId,'revoke',[input.lotId,input.reason,context.actorId]);
      if (!op.replayed) {
        await expire(state,context.actorId);
        const lot=state.lots.find(l=>l.id===input.lotId);
        if (!lot||lot.revoked||lot.remaining_paise<=0) throw new AppError(409,'This credit has no unused balance to revoke');
        await append(state,{kind:'REVOKE',lot_id:lot.id,amount_paise:-lot.remaining_paise,expires_at:lot.expires_at,sale_id:null,operation_id:op.id,actor_id:context.actorId,reason:input.reason});
      }
      return snapshot(state);
    });
  },
  /** Called inside the sale transaction; stock, invoice and wallet commit together. */
  async redeem(context: Context,amountPaise:number,saleId:string) {
    return withPostgresTransaction(async()=>{
      const state=(await load(context,true))!;
      const op=await operation(state,`sale:${saleId}`,'redeem',[amountPaise,saleId]);
      if (op.replayed) return;
      await expire(state,context.actorId);
      for (const {lot,amount} of planRedemption(state.lots,amountPaise,state.now)) {
        await append(state,{kind:'REDEEM',lot_id:lot.id,amount_paise:-amount,expires_at:lot.expires_at,sale_id:saleId,operation_id:op.id,actor_id:context.actorId,reason:'Nex Coins applied to invoice'});
      }
    });
  },
  /** Coin refunds restore original lots and original deadlines, never cash. */
  async refund(context: Context,originalSaleId:string,returnSaleId:string,amountPaise:number) {
    return withPostgresTransaction(async()=>{
      const state=(await load(context,true))!;
      const op=await operation(state,`return:${returnSaleId}`,'refund',[originalSaleId,amountPaise]);
      if (op.replayed) return;
      await expire(state,context.actorId);
      let remaining=amountPaise;
      const spent=state.entries.filter(e=>e.kind==='REDEEM'&&e.sale_id===originalSaleId);
      for (const spend of [...spent].reverse()) {
        const lot=state.lots.find(l=>l.id===spend.lot_id)!;
        const refunded=state.entries.filter(e=>e.kind==='REFUND'&&e.lot_id===lot.id&&e.reason===`Return of ${originalSaleId}`).reduce((n,e)=>n+e.amount_paise,0);
        const amount=Math.min(remaining,-spend.amount_paise-refunded);
        if (amount<=0) continue;
        await append(state,{kind:'REFUND',lot_id:lot.id,amount_paise:amount,expires_at:lot.expires_at,sale_id:returnSaleId,operation_id:op.id,actor_id:context.actorId,reason:`Return of ${originalSaleId}`});
        if (lot.revoked) await append(state,{kind:'REVOKE',lot_id:lot.id,amount_paise:-amount,expires_at:lot.expires_at,sale_id:returnSaleId,operation_id:op.id,actor_id:context.actorId,reason:'Returned promotional credits were previously revoked'});
        remaining-=amount;
        if (!remaining) break;
      }
      if (remaining) throw new AppError(409,'Wallet refund exceeds the promotional credits used on this invoice');
      await expire(state,context.actorId);
    });
  },
};
