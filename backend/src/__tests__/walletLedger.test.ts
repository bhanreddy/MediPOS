import { GENESIS, applyEntry, availablePaise, entryMac, headMac, planRedemption, verifyLedger, type WalletAccount, type WalletEntry } from '../services/wallet/walletLedger';
const key='ab'.repeat(32);
function fixture(){
 const account:WalletAccount={id:'account',clinic_id:'clinic',customer_id:'customer',last_sequence:0,head_hash:GENESIS,head_mac:''};
 const credit:WalletEntry={id:'credit',account_id:'account',sequence:1,kind:'CREDIT',lot_id:'lot',amount_paise:1000,balance_after_paise:1000,expires_at:'2026-12-01T00:00:00.000Z',sale_id:null,operation_id:'operation',actor_id:'owner',reason:'Welcome promotion',created_at:'2026-11-01T00:00:00.000Z',previous_hash:GENESIS,hash:''};
 credit.hash=entryMac(key,account,credit);account.last_sequence=1;account.head_hash=credit.hash;account.head_mac=headMac(key,account);
 return {account,credit};
}
test('verifies signatures and enforces the exact expiry instant',()=>{
 const {account,credit}=fixture();const lots=verifyLedger(key,account,[credit]);
 expect(availablePaise(lots,'2026-11-30T23:59:59.999Z')).toBe(1000);
 expect(availablePaise(lots,'2026-12-01T00:00:00.000Z')).toBe(0);
 expect(()=>planRedemption(lots,1,credit.expires_at)).toThrow('expired');
});
test.each(['amount_paise','expires_at','reason','actor_id','operation_id','sale_id','lot_id','created_at','previous_hash','balance_after_paise'] as const)('detects changes to signed %s',field=>{
 const {account,credit}=fixture();const edited={...credit,[field]:typeof credit[field]==='number'?Number(credit[field])+1:'changed'};
 expect(()=>verifyLedger(key,account,[edited])).toThrow('integrity');
});
test('detects a missing tail, replay in another store, and a forged account head',()=>{
 const {account,credit}=fixture();
 expect(()=>verifyLedger(key,account,[])).toThrow('integrity');
 expect(()=>verifyLedger(key,{...account,clinic_id:'other'},[credit])).toThrow('integrity');
 expect(()=>verifyLedger(key,{...account,last_sequence:0,head_hash:GENESIS},[])).toThrow('integrity');
});
test('integer minor units and grant limits prevent fractional or excessive spending',()=>{
 const {account,credit}=fixture();const lots=verifyLedger(key,account,[credit]);
 expect(()=>planRedemption(lots,0.5,credit.created_at)).toThrow();
 expect(()=>planRedemption(lots,1001,credit.created_at)).toThrow();
 expect(planRedemption(lots,1,credit.created_at)[0].amount).toBe(1);
 expect(()=>applyEntry(lots,{...credit,kind:'REDEEM',amount_paise:-1001})).toThrow('integrity');
});
