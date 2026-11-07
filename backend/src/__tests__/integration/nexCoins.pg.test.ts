import { randomUUID } from 'node:crypto';
const database=process.env.TEST_DATABASE_URL;
if(database){const u=new URL(database);if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.endsWith('_qa'))throw Error('Nex Coins writes require a disposable local *_qa database');process.env.DATABASE_URL=database;}
process.env.WALLET_LEDGER_SECRET='ab'.repeat(32);
const clinic=randomUUID(),actor=randomUUID();let role='OWNER';
jest.mock('../../middleware/auth',()=>({requireAuth:(req:any,_res:any,next:any)=>{req.user={id:actor,clinic_id:clinic,role};next();}}));
jest.mock('../../middleware/planEnforcement',()=>({enforcePlan:(_req:any,_res:any,next:any)=>next()}));
jest.mock('../../services/dailySalesSummary',()=>({DailySalesSummaryService:{refresh:jest.fn()}}));
import express from 'express';
import request from 'supertest';
import sql from '../../db';
import * as persistence from '../../lib/postgresDb';
import { withPostgresTransaction } from '../../lib/postgresDb';
import { WalletService } from '../../services/wallet/walletService';
import { DEFAULT_COIN_POLICY, getCoinPolicy, setCoinPolicy, type CoinPolicy } from '../../services/wallet/coinPolicy';
import { settleCloudBalance } from '../../services/cloudSettlement';
import { walletRouter } from '../../routes/wallet';
import { salesRouter } from '../../routes/sales';
import { errorHandler } from '../../middleware/errorHandler';
(database?describe:describe.skip)('Nex Coins: automatic earning and owner thresholds',()=>{
 const app=express();app.use(express.json());app.use('/wallet',walletRouter);app.use('/sales',salesRouter);app.use(errorHandler);
 const medicine=randomUUID(),batch=randomUUID();
 const ctx=(customerId:string)=>({clinicId:clinic,customerId,actorId:actor});
 async function customer(){const id=randomUUID();await sql`INSERT INTO customers(id,_local_id,clinic_id,name,phone) VALUES(${id},${id},${clinic},'Nex Coins QA','9000000000')`;return id;}
 const body=async(id:string,total=50,wallet=0,quantity=1)=>{await sql`UPDATE medicine_batches SET mrp=${total/quantity} WHERE id=${batch}`;return {customer_id:id,_local_id:randomUUID(),payment_mode:'cash',paid_amount:total-wallet/100,wallet_amount_paise:wallet,price_includes_tax:true,items:[{medicine_id:medicine,batch_id:batch,quantity,mrp:total/quantity,gst_rate:0}]};};
 const buy=async(id:string,total=50,wallet=0,quantity=1)=>request(app).post('/sales').send(await body(id,total,wallet,quantity));
 const refund=(sale:any,quantity=1)=>request(app).post('/sales/returns').send({original_sale_id:sale.id,_local_id:randomUUID(),items:[{sale_item_id:sale.sale_items[0].id,quantity}]});
 async function rules(changes:Partial<CoinPolicy>={}){const current=await getCoinPolicy(clinic);return (await setCoinPolicy(clinic,actor,{...DEFAULT_COIN_POLICY,...changes,version:current.version,reason:'QA earning policy'}));}
 beforeAll(async()=>{
  await sql`INSERT INTO clinics(id,_local_id,name,slug) VALUES(${clinic},${clinic},'Nex Coins QA',${clinic})`;
  await sql`INSERT INTO users(id,email,full_name,role) VALUES(${actor},${actor+'@example.invalid'},'Nex Coins owner','OWNER')`;
  await sql`INSERT INTO medicines(id,_local_id,clinic_id,name,generic_name,gst_rate) VALUES(${medicine},${medicine},${clinic},'Nex test item','QA',0)`;
  await sql`INSERT INTO medicine_batches(id,_local_id,clinic_id,medicine_id,batch_number,expiry_date,mrp,purchase_price,quantity_in,quantity_remaining) VALUES(${batch},${batch},${clinic},${medicine},'QA-NEX','2099-12-31',20,10,1000,1000)`;
 });
 beforeEach(async()=>{role='OWNER';await rules();});
 afterAll(async()=>{await sql.end()});
 test('a 10-coin balance becomes 15 after a ₹50 paid sale at 10%, exactly once',async()=>{
  const id=await customer();const first=await buy(id,100);expect(first.status).toBe(201);expect(Number(first.body.data.nex_coins_earned_paise)).toBe(1000);
  const requestBody=await body(id,50),sale=await request(app).post('/sales').send(requestBody);expect(sale.status).toBe(201);expect(Number(sale.body.data.nex_coins_earned_paise)).toBe(500);
  const state=await WalletService.get(ctx(id));expect(state.balance_paise).toBe(1500);expect(state.entries[0].kind).toBe('EARN');
  expect(Date.parse(state.lots[0].expires_at)-Date.parse(state.lots[0].issued_at)).toBe(90*86400000);
  expect((await request(app).post('/sales').send(requestBody)).status).toBe(200);expect((await WalletService.get(ctx(id))).balance_paise).toBe(1500);
 });
 test('coins are earned only on external payment, not the value already redeemed',async()=>{
  const id=await customer();await buy(id,100);const sale=await buy(id,50,1000);expect(sale.status).toBe(201);
  expect(Number(sale.body.data.nex_coins_earned_paise)).toBe(400);expect((await WalletService.get(ctx(id))).balance_paise).toBe(400);
 });
 test('all three thresholds are enforced by the server, including a 5% earning rate',async()=>{
  const id=await customer();await buy(id,1000); // 100 coins before changing the rules.
  await rules({rate_bps:500,minimum_sale_paise:10000,earning_cap_paise:300,redemption_limit_percent:20});
  const small=await buy(id,50);expect(Number(small.body.data.nex_coins_earned_paise)).toBe(0);
  const large=await buy(id,200);expect(Number(large.body.data.nex_coins_earned_paise)).toBe(300);
  expect((await buy(id,50,1100)).status).toBe(409);
  const allowed=await buy(id,50,1000);expect(allowed.status).toBe(201);expect(Number(allowed.body.data.nex_coins_earned_paise)).toBe(0);
 });
 test('neither owners nor cashiers can issue coins manually, and only owners can change thresholds',async()=>{
  const id=await customer();expect((await request(app).post(`/wallet/${id}/credits`).send({amount_paise:999999})).status).toBe(404);
  role='CASHIER';expect((await request(app).put('/wallet/settings').send({...DEFAULT_COIN_POLICY,reason:'Cashier edit'})).status).toBe(403);
  role='OWNER';expect((await request(app).put('/wallet/settings').send({...await getCoinPolicy(clinic),rate_bps:1100,reason:'Invalid rate'})).status).toBe(400);
  const version=await getCoinPolicy(clinic);await rules({rate_bps:500});
  expect((await request(app).put('/wallet/settings').send({...version,reason:'Stale edit'})).status).toBe(409);
 });
 test('a returned cash sale reverses its automatic earning',async()=>{
  const id=await customer();const sale=await buy(id,50);expect((await WalletService.get(ctx(id))).balance_paise).toBe(500);
  const returned=await refund(sale.body.data);expect(returned.status).toBe(200);expect(returned.body.data.external_refund_amount).toBe(50);
  const state=await WalletService.get(ctx(id));expect(state.balance_paise).toBe(0);expect(state.debt_paise).toBe(0);expect(state.entries[0].kind).toBe('CLAWBACK');
 });
 test('spent rewards from a returned sale offset future earnings once, without withdrawing cash',async()=>{
  const id=await customer();const original=await buy(id,50);await buy(id,5,500);expect((await WalletService.get(ctx(id))).balance_paise).toBe(0);
  expect((await refund(original.body.data)).status).toBe(200);
  let state=await WalletService.get(ctx(id));expect(state.debt_paise).toBe(500);expect(state.balance_paise).toBe(0);
  await buy(id,50);state=await WalletService.get(ctx(id));expect(state.debt_paise).toBe(0);expect(state.balance_paise).toBe(0);expect(state.entries[0].debt_offset_paise).toBe(500);
  await buy(id,50);expect((await WalletService.get(ctx(id))).balance_paise).toBe(500);
 });
 test('a return below the minimum sale removes eligibility, while a still-capped sale retains its cap',async()=>{
  await rules({minimum_sale_paise:10000});let id=await customer();let sale=await buy(id,100,0,10);expect((await WalletService.get(ctx(id))).balance_paise).toBe(1000);
  expect((await refund(sale.body.data,1)).status).toBe(200);expect((await WalletService.get(ctx(id))).balance_paise).toBe(0);
  await rules({earning_cap_paise:300});id=await customer();sale=await buy(id,100,0,10);
  expect((await refund(sale.body.data,1)).status).toBe(200);expect((await WalletService.get(ctx(id))).balance_paise).toBe(300);
  expect((await refund(sale.body.data,9)).status).toBe(200);expect((await WalletService.get(ctx(id))).balance_paise).toBe(0);
 });
 test('credit bills earn only when the invoice becomes fully paid',async()=>{
  const id=await customer();const sale=await request(app).post('/sales').send({...(await body(id,50)),payment_mode:'credit',paid_amount:0});expect(sale.status).toBe(201);expect((await WalletService.get(ctx(id))).balance_paise).toBe(0);
  await withPostgresTransaction(async ()=>(await settleCloudBalance({clinicId:clinic,userId:actor,kind:'customer',partyId:id,amount:25,mode:'cash'})));
  expect((await WalletService.get(ctx(id))).balance_paise).toBe(0);
  await withPostgresTransaction(async ()=>(await settleCloudBalance({clinicId:clinic,userId:actor,kind:'customer',partyId:id,amount:25,mode:'cash'})));
  expect((await WalletService.get(ctx(id))).balance_paise).toBe(500);
 });
 test('policy edits are append-only and never change earlier award deadlines',async()=>{
  const id=await customer();await buy(id,50);const before=await WalletService.get(ctx(id));
  await rules({expiry_days:30});await buy(id,50);const after=await WalletService.get(ctx(id));
  expect(after.lots.find(l=>l.id===before.lots[0].id)?.expires_at).toBe(before.lots[0].expires_at);
  expect(Date.parse(after.lots[0].expires_at)-Date.parse(after.lots[0].issued_at)).toBe(30*86400000);
  await expect(sql`UPDATE nex_coin_policies SET rate_bps=1000 WHERE clinic_id=${clinic}`).rejects.toThrow('append-only');
  await expect(sql`DELETE FROM nex_coin_policies WHERE clinic_id=${clinic}`).rejects.toThrow('append-only');
 });
 test('a failure after automatic earning rolls back the award, invoice, and stock together',async()=>{
  const id=await customer(),requestBody=await body(id,50),original=persistence.localMutate;
  const before=Number((await sql`SELECT quantity_remaining FROM medicine_batches WHERE id=${batch}`)[0].quantity_remaining);
  const spy=jest.spyOn(persistence,'localMutate').mockImplementation(async input=>{
   if(input.table==='sales'&&input.data.nex_coins_earned_paise)throw new Error('Forced reward persistence failure');
   return (await original(input));
  });
  const failed=await request(app).post('/sales').send(requestBody);expect(failed.status).toBe(500);spy.mockRestore();
  expect((await WalletService.get(ctx(id))).balance_paise).toBe(0);
  expect((await sql`SELECT id FROM sales WHERE _local_id=${requestBody._local_id}`).length).toBe(0);
  expect(Number((await sql`SELECT quantity_remaining FROM medicine_batches WHERE id=${batch}`)[0].quantity_remaining)).toBe(before);
  expect((await request(app).post('/sales').send(requestBody)).status).toBe(201);
  expect((await WalletService.get(ctx(id))).balance_paise).toBe(500);
 });

});
