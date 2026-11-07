import { once } from 'node:events';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
const database=process.env.TEST_DATABASE_URL;
if(database){const url=new URL(database);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_qa'))throw new Error('Phase 2 requires disposable local *_qa database');process.env.DATABASE_URL=database;}
process.env.WALLET_LEDGER_SECRET='a'.repeat(64);
jest.mock('../../middleware/planEnforcement',()=>({enforcePlan:(_req:unknown,_res:unknown,next:()=>void)=>next()}));
import { createApp } from '../../app';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sql from '../../db';
const pg=database?describe:describe.skip;
const expiry=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
pg('Phase 2 real PostgreSQL integrity',()=>{
 const app=createApp();
 let server: Server;
 beforeAll(async () => {
   server = app.listen(0, '127.0.0.1');
   await once(server, 'listening');
 });
 const call=(method:'get'|'post'|'patch'|'put',path:string,token:string,body?:object)=>request(server)[method](`/api${path}`).set('Authorization',`Bearer ${token}`).send(body);
 async function tenant(){
  const org=randomUUID(),clinic=randomUUID(),store=randomUUID(),owner=randomUUID(),cashier=randomUUID(),pharmacist=randomUUID(),supplier=randomUUID(),medicine=randomUUID();
  await sql`INSERT INTO organizations(id,_local_id,legal_name,display_name,code) VALUES(${org},${org},'Phase 2 QA','Phase 2 QA',${org})`;
  await sql`INSERT INTO clinics(id,_local_id,name,slug,organization_id) VALUES(${clinic},${clinic},'Phase 2 QA',${clinic},${org})`;
  await sql`INSERT INTO stores(id,_local_id,organization_id,clinic_id,store_code,name) VALUES(${store},${store},${org},${clinic},${store},'Counter')`;
  const tokens:Record<string,string>={};
  for(const [id,role] of [[owner,'OWNER'],[cashier,'CASHIER'],[pharmacist,'PHARMACIST']]){
   await sql`INSERT INTO auth.users(id) VALUES(${id})`;
   await sql`INSERT INTO users(id,_local_id,clinic_id,full_name,email,role) VALUES(${id},${id},${clinic},${role},${`${id}@example.invalid`},${role})`;
   const a=randomUUID(),b=randomUUID();
   await sql`INSERT INTO user_organization_access(id,_local_id,user_id,organization_id,role) VALUES(${a},${a},${id},${org},${role})`;
   await sql`INSERT INTO user_store_access(id,_local_id,user_id,organization_id,store_id,role,is_default) VALUES(${b},${b},${id},${org},${store},${role==='OWNER'?'STORE_MANAGER':role},true)`;
   tokens[role]=jwt.sign({sub:id,clinic_id:clinic,role},process.env.JWT_SECRET!,{expiresIn:'1h'});
  }
  await sql`INSERT INTO suppliers(id,_local_id,clinic_id,organization_id,name) VALUES(${supplier},${supplier},${clinic},${org},'QA supplier')`;
  await sql`INSERT INTO medicines(id,_local_id,clinic_id,organization_id,name,gst_rate) VALUES(${medicine},${medicine},${clinic},${org},'QA medicine',0)`;
  return {org,clinic,store,owner,cashier,pharmacist,supplier,medicine,tokens};
 }
 async function batch(t:Awaited<ReturnType<typeof tenant>>,quantity:number,days:number,disposed=false){
  const id=randomUUID();await sql`INSERT INTO medicine_batches(id,_local_id,clinic_id,organization_id,store_id,medicine_id,supplier_id,batch_number,expiry_date,quantity_in,quantity_remaining,mrp,purchase_price,is_disposed)
   VALUES(${id},${id},${t.clinic},${t.org},${t.store},${t.medicine},${t.supplier},${id},${expiry(days)},${quantity},${quantity},10,5,${disposed})`;return id;
 }
 const line=(medicine:string,quantity:number,batch_id?:string)=>({medicine_id:medicine,quantity,mrp:10,gst_rate:0,...(batch_id?{batch_id,allocation_mode:'manual'}:{allocation_mode:'auto'})});
 const stock=async(id:string)=>Number((await sql`SELECT quantity_remaining FROM medicine_batches WHERE id=${id}`)[0].quantity_remaining);
 afterAll(async () => {
   await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
   await sql.end();
 });
 test('cash and UPI settle atomically, and the X/Z reports reconcile every drawer movement', async () => {
   const t = await tenant();
   const batchId = await batch(t, 200, 120);
   const token = t.tokens.CASHIER;
   const opening = { opening_paise: 50000, request_id: randomUUID() };
   expect((await call('post', '/register/open', token, { request_id: randomUUID() })).status).toBe(400);
   const payments = [
     { tender_type: 'CASH', amount_paise: 40000 },
     { tender_type: 'UPI', amount_paise: 60000, reference_number: 'QA-UPI-1' },
   ];
   const body = { _local_id: randomUUID(), register_required: true, items: [line(t.medicine, 100)], payments };
   expect((await call('post', '/sales', token, body)).status).toBe(409);
   expect(await stock(batchId)).toBe(200);
   const opened = await call('post', '/register/open', token, opening);
   if (opened.status !== 201) throw Error(JSON.stringify(opened.body));
   const id = opened.body.data.id;
   expect((await call('post', '/register/open', token, opening)).body.data.id).toBe(id);
   expect((await call('get', `/register/${id}/report`, t.tokens.PHARMACIST)).status).toBe(404);
   const [checkout, retry] = await Promise.all([call('post','/sales',token,body), call('post','/sales',token,body)]);
   expect([checkout.status, retry.status].sort()).toEqual([200, 201]);
   const sale = checkout.body.data;
   expect(sale.id).toBe(retry.body.data.id);
   expect(sale.payment_transactions).toHaveLength(2);
   expect(sale.payment_transactions.find((row: any) => row.tender_type === 'UPI')).toMatchObject({
     amount_paise: '60000', reference_number: 'QA-UPI-1', register_session_id: id,
   });
   expect(await stock(batchId)).toBe(100);
   const returnBody = { _local_id: randomUUID(), original_sale_id: sale.id, refund_method: 'original',
     register_required: true, items: [{ sale_item_id: sale.sale_items[0].id, quantity: 50, reason: 'Customer return' }] };
   const returned = await call('post', '/sales/returns', token, returnBody);
   expect(returned.status).toBe(200);
   const reversals = await sql`SELECT tender_type, amount_paise, original_payment_id FROM payment_transactions WHERE return_id=${returned.body.data.id} ORDER BY tender_type`;
   expect(reversals.map(row => [row.tender_type, Number(row.amount_paise), !!row.original_payment_id]))
     .toEqual([['CASH', -40000, true], ['UPI', -10000, true]]);
   for (const [kind, amount_paise] of [['CASH_IN', 5000], ['CASH_OUT', 3000], ['DROP', 10000], ['EXPENSE', 2000]]) {
     const movement = { request_id: randomUUID(), kind, amount_paise, reason: 'Test drawer movement' };
     const result = await call('post', `/register/${id}/movements`, token, movement);
     expect(result.status).toBe(201);
     expect((await call('post', `/register/${id}/movements`, token, movement)).body.data.id).toBe(result.body.data.id);
   }
   const report = (await call('get', `/register/${id}/report`, token)).body.data;
   expect(report).toMatchObject({ kind: 'X', opening_paise: 50000, cash_sales_paise: 40000,
     cash_refunds_paise: 40000, cash_in_paise: 5000, cash_out_paise: 3000, drops_paise: 10000,
     expenses_paise: 2000, expected_paise: 40000 });
   const closed = await call('post', `/register/${id}/close`, token, { closing_paise: 39900 });
   expect(closed.body.data).toMatchObject({ kind: 'Z', actual_paise: 39900, variance_paise: -100 });
   expect((await call('get', `/register/${id}/report`, token)).body.data).toMatchObject({ kind: 'Z', expected_paise: 40000 });
   expect((await call('post','/sales',token,{...body,_local_id:randomUUID()})).status).toBe(409);
 });
 test('a parked bill keeps its state, is claimed once, and uses fresh stock at edited checkout', async () => {
   const t = await tenant();
   const id = await batch(t, 10, 120);
   const actor = t.tokens.CASHIER;
   const draft = { request_id: randomUUID(), cart: [line(t.medicine, 3)], totals: { bill_discount: '0' }, notes: 'call back' };
   const parked = await call('post', '/pos/park', actor, draft);
   if (parked.status !== 201) throw Error(JSON.stringify(parked.body));
   const parkedId = parked.body.data.id;
   expect(await stock(id)).toBe(10);
   expect((await call('post','/pos/park',actor,draft)).body.data.id).toBe(parkedId);
   const search = await call('get','/pos/parked?q=call%20back',actor);
   expect(search.body.data.map((row:any) => row.id)).toEqual([parkedId]);
   const [claimed, rejected] = await Promise.all([
     call('post',`/pos/parked/${parkedId}/resume`,actor),
     call('post',`/pos/parked/${parkedId}/resume`,t.tokens.PHARMACIST),
   ]);
   const winningActor = claimed.status === 200 ? actor : t.tokens.PHARMACIST;
   expect([claimed.status, rejected.status].sort()).toEqual([200, 409]);
   const snapshot = claimed.status === 200 ? claimed.body.data : rejected.body.data;
   expect(snapshot.cart_snapshot[0].quantity).toBe(3);
   const edited = { ...draft, resume_id: parkedId, request_id: randomUUID(), cart: [line(t.medicine, 4)] };
   expect((await call('post','/pos/park',winningActor,edited)).body.data.id).toBe(parkedId);
   expect((await call('post',`/pos/parked/${parkedId}/resume`,winningActor)).body.data.cart_snapshot[0].quantity).toBe(4);
   const bill = { _local_id: randomUUID(), park_id: parkedId, paid_amount: 50, items: [line(t.medicine,5)] };
   const checkout = await call('post','/sales',winningActor,bill);
   if (checkout.status !== 201) throw Error(JSON.stringify(checkout.body));
   expect(await stock(id)).toBe(5);
   expect((await call('post','/sales',winningActor,{ ...bill, _local_id: randomUUID() })).status).toBe(409);
   expect((await sql`SELECT status, completed_sale_id FROM parked_sales WHERE id=${parkedId}`)[0])
     .toEqual({status:'COMPLETED',completed_sale_id:checkout.body.data.id});
   const cancellable = await call('post','/pos/park',actor,{ ...draft, request_id: randomUUID() });
   expect((await call('post',`/pos/parked/${cancellable.body.data.id}/cancel`,actor)).status).toBe(200);
   expect(await stock(id)).toBe(5);
 });

 test('manual batches use available stock and employee discounts require a matching one-time owner approval', async () => {
   const t = await tenant();
   const early = await batch(t, 3, 90), late = await batch(t, 10, 190);
   await batch(t, 30, -1);
   await batch(t, 30, 80, true);
   const token = t.tokens.CASHIER;
   const options = await call('get',`/sales/medicine/${t.medicine}/batches`,token);
   expect(options.body.data.map((row:any) => row.id)).toEqual([early,late]);
   expect((await call('put',`/counter/discount-employees/${t.cashier}`,token,{max_basis_points:500})).status).toBe(403);
   expect((await call('put',`/counter/discount-employees/${t.cashier}`,t.tokens.OWNER,{max_basis_points:500})).status).toBe(200);
   const checkout = { _local_id: randomUUID(), discount_reason:'Owner-approved pharmacy promotion',
     payment_mode:'upi', paid_amount:38, discount:2, items:[{...line(t.medicine,5,late),discount_pct:20}] };
   expect((await call('post','/sales',token,checkout)).status).toBe(403);
   const request = await call('post','/counter/discount-approvals',token,checkout);
   if(request.status!==201)throw Error(JSON.stringify(request.body));
   const id = request.body.data.id;
   expect((await call('post',`/counter/discount-approvals/${id}/approve`,token)).status).toBe(403);
   expect((await call('post',`/counter/discount-approvals/${id}/approve`,t.tokens.OWNER)).status).toBe(200);
   expect((await call('post','/sales',token,{...checkout,discount:3,discount_approval_id:id})).status).toBe(403);
   const posted = await call('post','/sales',token,{...checkout,discount_approval_id:id});
   if(posted.status!==201)throw Error(JSON.stringify(posted.body));
   expect(await stock(early)).toBe(3);
   expect(await stock(late)).toBe(5);
   const audit = await sql`SELECT action, details FROM counter_sale_audit WHERE sale_id=${posted.body.data.id} ORDER BY action`;
   expect(audit[0].details).toMatchObject({approved_by:t.owner,approval_id:id});
   expect(audit[1].details).toMatchObject([{batch_id:late,quantity:5}]);
   expect((await call('post','/sales',token,{...checkout,_local_id:randomUUID(),discount_approval_id:id})).status).toBe(403);
 });

 test('cash plus credit posts the exact outstanding and an authorized void restores stock and reconciles both tenders', async () => {
   const t = await tenant();
   const id = await batch(t, 10, 180);
   const customer = await call('post','/customers',t.tokens.OWNER,{name:'QA Customer',phone:'9876500012'});
   const customerId = customer.body.data.id;
   const payload = { _local_id: randomUUID(), customer_id: customerId, items: [line(t.medicine,5)],
     payments: [{tender_type:'CASH',amount_paise:2000},{tender_type:'CREDIT',amount_paise:3000}] };
   expect((await call('post','/sales',t.tokens.CASHIER,{...payload,payments:[{tender_type:'CASH',amount_paise:4999}]})).status).toBe(409);
   const sale = await call('post','/sales',t.tokens.CASHIER,payload);
   if (sale.status !== 201) throw Error(JSON.stringify(sale.body));
   expect(Number(sale.body.data.balance_due)).toBe(30);
   const saleId = sale.body.data.id;
   const body = { _local_id: randomUUID(), reason:'Duplicate paper entry', restock: true };
   expect((await call('post',`/sales/${saleId}/void`,t.tokens.CASHIER,body)).status).toBe(403);
   const cancelled = await call('post',`/sales/${saleId}/void`,t.tokens.OWNER,body);
   if(cancelled.status!==200)throw Error(JSON.stringify(cancelled.body));
   const replayed = await call('post',`/sales/${saleId}/void`,t.tokens.OWNER,body);
   if (replayed.status !== 200) throw Error(JSON.stringify(replayed.body));
   expect(replayed.body.data.id).toBe(cancelled.body.data.id);
   expect((await call('post',`/sales/${saleId}/void`,t.tokens.OWNER,{...body,_local_id:randomUUID()})).status).toBe(409);
   expect(await stock(id)).toBe(10);
   expect(Number((await sql`SELECT outstanding_balance FROM customers WHERE id=${customerId}`)[0].outstanding_balance)).toBe(0);
   const entries = await sql`SELECT tender_type,amount_paise FROM payment_transactions WHERE return_id=${cancelled.body.data.id} ORDER BY tender_type`;
   expect(entries.map(row=>[row.tender_type,Number(row.amount_paise)])).toEqual([['CASH',-2000],['CREDIT',-3000]]);
   expect((await sql`SELECT id,invoice_number FROM sales WHERE id=${saleId}`)[0].invoice_number).toBe(sale.body.data.invoice_number);
   expect((await call('get',`/sales/${saleId}/invoice`,t.tokens.OWNER)).text).toContain('Voided invoice');
 });

});
