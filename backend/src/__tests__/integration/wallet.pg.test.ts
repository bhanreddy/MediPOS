import { randomUUID } from 'node:crypto';
const database=process.env.TEST_DATABASE_URL;
if(database){const u=new URL(database);if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.endsWith('_qa'))throw Error('Wallet writes require a disposable local *_qa database');process.env.DATABASE_URL=database;}
process.env.WALLET_LEDGER_SECRET='ab'.repeat(32);
const clinic=randomUUID(),otherClinic=randomUUID(),actor=randomUUID();
let authClinic=clinic,role='OWNER';
jest.mock('../../middleware/auth',()=>({requireAuth:(req:any,_res:any,next:any)=>{req.user={id:actor,clinic_id:authClinic,role};next();}}));
jest.mock('../../middleware/planEnforcement',()=>({enforcePlan:(_req:any,_res:any,next:any)=>next()}));
jest.mock('../../services/dailySalesSummary',()=>({DailySalesSummaryService:{refresh:jest.fn()}}));
import express from 'express';
import request from 'supertest';
import sql from '../../db';
import * as persistence from '../../lib/postgresDb';
import { WalletService } from '../../services/wallet/walletService';
import { walletRouter } from '../../routes/wallet';
import { salesRouter } from '../../routes/sales';
import { errorHandler } from '../../middleware/errorHandler';

(database?describe:describe.skip)('Promotional wallet: real PostgreSQL security and transactions',()=>{
 const app=express();app.use(express.json());app.use('/wallet',walletRouter);app.use('/sales',salesRouter);app.use(errorHandler);
 const medicine=randomUUID(),batch=randomUUID();
 const context=(customerId:string)=>({clinicId:clinic,customerId,actorId:actor});
 const issue=(customerId:string,amount=5000,days=90,requestId=randomUUID())=>WalletService.issue(context(customerId),{amountPaise:amount,validityDays:days,reason:'QA welcome promotion',requestId});
 async function customer(){const id=randomUUID();await sql`INSERT INTO customers(id,_local_id,clinic_id,name,phone) VALUES(${id},${id},${clinic},'Wallet QA','9000000000')`;return id;}
 async function saleReference(customerId:string){const id=randomUUID();await sql`INSERT INTO sales(id,_local_id,clinic_id,customer_id,invoice_number,payment_mode,net_amount) VALUES(${id},${id},${clinic},${customerId},${id},'cash',100)`;return id;}
 const payload=(customerId:string,wallet=2000)=>({customer_id:customerId,_local_id:randomUUID(),payment_mode:'cash',paid_amount:40-wallet/100,price_includes_tax:true,wallet_amount_paise:wallet,items:[{medicine_id:medicine,batch_id:batch,quantity:2,mrp:20,gst_rate:12}]});
 beforeAll(async()=>{
  await sql`INSERT INTO clinics(id,_local_id,name,slug) VALUES(${clinic},${clinic},'Wallet QA',${clinic}),(${otherClinic},${otherClinic},'Other QA',${otherClinic})`;
  await sql`INSERT INTO users(id,email,full_name,role) VALUES(${actor},${`${actor}@example.invalid`},'Wallet owner','OWNER')`;
  await sql`INSERT INTO medicines(id,_local_id,clinic_id,name,generic_name) VALUES(${medicine},${medicine},${clinic},'Wallet test medicine','Generic')`;
  await sql`INSERT INTO medicine_batches(id,_local_id,clinic_id,medicine_id,batch_number,expiry_date,mrp,purchase_price,quantity_in,quantity_remaining) VALUES(${batch},${batch},${clinic},${medicine},'QA-WALLET','2099-12-31',20,10,1000,1000)`;
 });
 afterAll(async()=>{await sql.end()});
 afterEach(()=>{jest.restoreAllMocks();authClinic=clinic;role='OWNER';process.env.WALLET_LEDGER_SECRET='ab'.repeat(32)});
 test('issues 90-day credits, verifies signatures, and rejects replay with changed details',async()=>{
  const id=await customer(),requestId=randomUUID();
  const first=await issue(id,10001,90,requestId);
  expect(first.balance_paise).toBe(10001);expect(first.integrity_verified).toBe(true);
  expect(Date.parse(first.lots[0].expires_at)-Date.parse(first.lots[0].issued_at)).toBe(90*86400000);
  const replay=await issue(id,10001,90,requestId);expect(replay.total_entries).toBe(1);
  await expect(issue(id,10002,90,requestId)).rejects.toThrow('already been used');
 });
 test('cashiers cannot mint credits, and another store cannot see or spend a customer wallet',async()=>{
  const id=await customer();await issue(id);
  role='CASHIER';expect((await request(app).post(`/wallet/${id}/credits`).send({amount_paise:100,reason:'QA issue',request_id:randomUUID()})).status).toBe(404);
  role='OWNER';authClinic=otherClinic;expect((await request(app).get(`/wallet/${id}`)).status).toBe(404);
  expect((await request(app).post('/sales').send(payload(id))).status).toBe(404);
  expect((await WalletService.get(context(id))).balance_paise).toBe(5000);
 });
 test('database rejects history edits, deletion and truncation; head tampering blocks the wallet',async()=>{
  const id=await customer();await issue(id);
  const [account]=await sql`SELECT * FROM promo_wallet_accounts WHERE customer_id=${id}`;
  await expect(sql`UPDATE promo_wallet_ledger SET amount_paise=999 WHERE account_id=${account.id}`).rejects.toThrow('append-only');
  await expect(sql`DELETE FROM promo_wallet_ledger WHERE account_id=${account.id}`).rejects.toThrow('append-only');
  await expect(sql.unsafe('TRUNCATE promo_wallet_ledger')).rejects.toThrow('append-only');
  await expect(sql`DELETE FROM promo_wallet_operations WHERE account_id=${account.id}`).rejects.toThrow('append-only');
  await sql`UPDATE promo_wallet_accounts SET head_hash=${'f'.repeat(64)} WHERE id=${account.id}`;
  await expect(WalletService.get(context(id))).rejects.toThrow('integrity');
  await sql`UPDATE promo_wallet_accounts SET head_hash=${account.head_hash} WHERE id=${account.id}`;
  expect((await WalletService.get(context(id))).balance_paise).toBe(5000);
  process.env.WALLET_LEDGER_SECRET='cd'.repeat(32);
  await expect(WalletService.get(context(id))).rejects.toThrow('integrity');
 });
 test('concurrent requests cannot spend the same promotional balance twice',async()=>{
  const id=await customer();await issue(id,5000);
  const sale1=await saleReference(id),sale2=await saleReference(id);
  const results=await Promise.allSettled([WalletService.redeem(context(id),4000,sale1),WalletService.redeem(context(id),4000,sale2)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await WalletService.get(context(id))).balance_paise).toBe(1000);
 });
 test('redeems earliest-expiring awards first and revokes only unused credit',async()=>{
  const id=await customer();await issue(id,1000,90);await issue(id,2000,2);
  await WalletService.redeem(context(id),1500,await saleReference(id));
  const state=await WalletService.get(context(id));
  expect(state.lots.find(l=>l.issued_paise===2000)?.remaining_paise).toBe(500);
  const lot=state.lots.find(l=>l.issued_paise===1000)!;
  await WalletService.revoke(context(id),{lotId:lot.id,reason:'QA campaign correction',requestId:randomUUID()});
  expect((await WalletService.get(context(id))).balance_paise).toBe(500);
 });
 test('server deadlines block expired spending and refunds retain the original deadline',async()=>{
  const id=await customer();const issued=await issue(id,5000,1),sale=await saleReference(id);await WalletService.redeem(context(id),2000,sale);
  const original=persistence.postgresQuery;
  const future=new Date(Date.parse(issued.lots[0].expires_at)+1000);
  jest.spyOn(persistence,'postgresQuery').mockImplementation(((query:string,params:any[])=>query==='SELECT clock_timestamp() AS now'?Promise.resolve([{now:future}]):original(query,params)) as typeof persistence.postgresQuery);
  expect((await WalletService.get(context(id))).balance_paise).toBe(0);
  await expect(WalletService.redeem(context(id),1,await saleReference(id))).rejects.toThrow('expired');
  const returnSale=await saleReference(id);await WalletService.refund(context(id),sale,returnSale,2000);
  const after=await WalletService.get(context(id));expect(after.balance_paise).toBe(0);expect(after.lots[0].expires_at).toBe(issued.lots[0].expires_at);
  expect(after.entries.some(e=>e.kind==='REFUND')).toBe(true);expect(after.entries[0].kind).toBe('EXPIRE');
 });
 test('wallet, stock, and invoice commit once together; exact checkout retries are idempotent',async()=>{
  const id=await customer();await issue(id,5000);const body=payload(id);
  const before=await sql`SELECT quantity_remaining FROM medicine_batches WHERE id=${batch}`;
  const first=await request(app).post('/sales').send(body);expect(first.status).toBe(201);
  expect(Number(first.body.data.wallet_redeemed_paise)).toBe(2000);expect(Number(first.body.data.paid_amount)).toBe(40);
  const retry=await request(app).post('/sales').send(body);expect(retry.status).toBe(200);expect(retry.body.data.id).toBe(first.body.data.id);
  expect((await WalletService.get(context(id))).balance_paise).toBe(3200);
  expect(Number((await sql`SELECT quantity_remaining FROM medicine_batches WHERE id=${batch}`)[0].quantity_remaining)).toBe(Number(before[0].quantity_remaining)-2);
  expect((await request(app).post('/sales').send({...body,paid_amount:19})).status).toBe(409);
 });
 test('a failure after the wallet debit rolls back the balance, invoice, and stock',async()=>{
  const id=await customer();await issue(id,5000);const body=payload(id);
  jest.spyOn(persistence,'localInsertMany').mockRejectedValueOnce(new Error('Forced downstream failure'));
  const result=await request(app).post('/sales').send(body);expect(result.status).toBe(500);
  expect((await WalletService.get(context(id))).balance_paise).toBe(5000);
  expect((await sql`SELECT id FROM sales WHERE _local_id=${body._local_id}`).length).toBe(0);
 });
 test('partial returns restore only the promotional share without creating a cash refund from credits',async()=>{
  const id=await customer();await issue(id,5000);const sold=await request(app).post('/sales').send(payload(id));expect(sold.status).toBe(201);
  const body={original_sale_id:sold.body.data.id,_local_id:randomUUID(),items:[{sale_item_id:sold.body.data.sale_items[0].id,quantity:1,reason:'QA partial return'}]};
  const returned=await request(app).post('/sales/returns').send(body);expect(returned.status).toBe(200);
  expect(Number(returned.body.data.wallet_redeemed_paise)).toBe(1000);expect(returned.body.data.external_refund_amount).toBe(10);
  expect((await WalletService.get(context(id))).balance_paise).toBe(4100);
  const retry=await request(app).post('/sales/returns').send(body);expect(retry.status).toBe(200);expect((await WalletService.get(context(id))).balance_paise).toBe(4100);
 });
 test('full-wallet bills and returns never require or create a cash payment',async()=>{
  const id=await customer();await issue(id,5000);
  const sold=await request(app).post('/sales').send({...payload(id,4000),payment_mode:'upi'});
  expect(sold.status).toBe(201);expect(sold.body.data.payment_mode).toBe('wallet');expect(Number(sold.body.data.paid_amount)).toBe(40);
  const returned=await request(app).post('/sales/returns').send({original_sale_id:sold.body.data.id,_local_id:randomUUID(),items:[{sale_item_id:sold.body.data.sale_items[0].id,quantity:2}]});
  expect(returned.status).toBe(200);expect(returned.body.data.external_refund_amount).toBe(0);expect(Number(returned.body.data.wallet_redeemed_paise)).toBe(4000);
  expect((await WalletService.get(context(id))).balance_paise).toBe(5000);
 });
 test('manual credit issuance is unavailable, including forged balance and expiry fields',async()=>{
  const id=await customer();
  const base={amount_paise:100,validity_days:90,reason:'QA promotion',request_id:randomUUID()};
  for(const extra of [{balance:999999},{expires_at:'2099-01-01'},{actor_id:randomUUID()},{amount_paise:0.5}]){
   expect((await request(app).post(`/wallet/${id}/credits`).send({...base,...extra})).status).toBe(404);
  }
  expect((await WalletService.get(context(id))).balance_paise).toBe(0);
 });
 test('row-level security denies a browser role even after an accidental table grant',async()=>{
  const id=await customer();await issue(id);
  await sql.unsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wallet_browser_qa') THEN CREATE ROLE wallet_browser_qa NOLOGIN; END IF; END $$; GRANT USAGE ON SCHEMA public TO wallet_browser_qa; GRANT SELECT,INSERT ON promo_wallet_accounts,promo_wallet_operations,promo_wallet_ledger TO wallet_browser_qa;`);
  await sql.begin(async tx=>{
   await tx.unsafe('SET LOCAL ROLE wallet_browser_qa');
   expect(Number((await tx`SELECT COUNT(*) AS count FROM promo_wallet_ledger`)[0].count)).toBe(0);
  });
  await expect(sql.begin(async tx=>{
   await tx.unsafe('SET LOCAL ROLE wallet_browser_qa');
   await tx`INSERT INTO promo_wallet_accounts(id,clinic_id,customer_id,head_hash,head_mac) VALUES(${randomUUID()},${clinic},${id},'fake','fake')`;
  })).rejects.toThrow('row-level security');
 });

 test('rounding many partial returns cannot convert a fully promotional invoice into cash',async()=>{
  const id=await customer();await issue(id,100);
  const sold=await request(app).post('/sales').send({...payload(id,2),paid_amount:0,items:[{medicine_id:medicine,batch_id:batch,quantity:3,mrp:0.01,discount_pct:33,gst_rate:0}]});
  expect(sold.status).toBe(201);expect(Number(sold.body.data.net_amount)).toBe(0.02);
  let returnedWallet=0;
  for(let i=0;i<3;i++){
   const returned=await request(app).post('/sales/returns').send({original_sale_id:sold.body.data.id,_local_id:randomUUID(),items:[{sale_item_id:sold.body.data.sale_items[0].id,quantity:1}]});
   expect(returned.status).toBe(200);expect(returned.body.data.external_refund_amount).toBe(0);returnedWallet+=Number(returned.body.data.wallet_redeemed_paise);
  }
  expect(returnedWallet).toBe(2);expect((await WalletService.get(context(id))).balance_paise).toBe(100);
 });

});
