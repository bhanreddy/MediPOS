import { randomUUID } from 'node:crypto';
const database=process.env.TEST_DATABASE_URL;
if(database){const url=new URL(database);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_qa'))throw new Error('Phase 1 requires disposable local *_qa database');process.env.DATABASE_URL=database;}
process.env.WALLET_LEDGER_SECRET='a'.repeat(64);
jest.mock('../../middleware/planEnforcement',()=>({enforcePlan:(_req:unknown,_res:unknown,next:()=>void)=>next()}));
import { createApp } from '../../app';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sql from '../../db';
const pg=database?describe:describe.skip;
const expiry=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
pg('Phase 1 real PostgreSQL integrity',()=>{
 const app=createApp();
 const call=(method:'get'|'post'|'patch',path:string,token:string,body?:object)=>request(app)[method](`/api${path}`).set('Authorization',`Bearer ${token}`).send(body);
 async function tenant(){
  const org=randomUUID(),clinic=randomUUID(),store=randomUUID(),owner=randomUUID(),cashier=randomUUID(),pharmacist=randomUUID(),supplier=randomUUID(),medicine=randomUUID();
  await sql`INSERT INTO organizations(id,_local_id,legal_name,display_name,code) VALUES(${org},${org},'Phase 1 QA','Phase 1 QA',${org})`;
  await sql`INSERT INTO clinics(id,_local_id,name,slug,organization_id) VALUES(${clinic},${clinic},'Phase 1 QA',${clinic},${org})`;
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
 afterAll(async()=>{await sql.end();});
 test('owner reconciliation changes canonical batch, position and ledger before checkout',async()=>{
  const t=await tenant(),b=await batch(t,9,180);
  const response=await call('post','/inventory/reconciliation/repair',t.tokens.OWNER,{medicineId:t.medicine,batchId:b,targetPhysicalQuantity:4,reason:'QA physical correction'});
  if(response.status!==200)throw Error(JSON.stringify(response.body));
  expect(await stock(b)).toBe(4);
  const [movement]=await sql`SELECT movement_type,quantity_delta,balance_after FROM stock_ledger WHERE id=${response.body.data.repairedMovementId}`;
  expect(movement).toMatchObject({movement_type:'RECONCILIATION_CORRECTION',quantity_delta:-5,balance_after:4});
  expect((await call('post','/sales',t.tokens.CASHIER,{paid_amount:50,items:[line(t.medicine,5)]})).status).toBe(409);
 });
 test('existing store transfer moves PostgreSQL stock and retries a receipt without moving stock twice',async()=>{
  const t=await tenant(),b=await batch(t,9,180),dest=randomUUID(),membership=randomUUID();
  await sql`INSERT INTO stores(id,_local_id,organization_id,clinic_id,store_code,name) VALUES(${dest},${dest},${t.org},${t.clinic},${dest},'Destination')`;
  await sql`INSERT INTO user_store_access(id,_local_id,user_id,organization_id,store_id,role) VALUES(${membership},${membership},${t.owner},${t.org},${dest},'STORE_MANAGER')`;
  const created=await call('post','/transfers',t.tokens.OWNER,{transferType:'STORE_TO_STORE',sourceLocationType:'STORE',sourceLocationId:t.store,destinationLocationType:'STORE',destinationLocationId:dest,items:[{medicineId:t.medicine,requestedQuantity:4}]});
  if(created.status!==201)throw Error(JSON.stringify(created.body));
  const id=created.body.id;
  const approved=await call('post',`/transfers/${id}/approve`,t.tokens.OWNER,{});
  if(approved.status!==200)throw Error(JSON.stringify(approved.body));
  const alloc=approved.body.allocations[0];
  const dispatched=await call('post',`/transfers/${id}/dispatch`,t.tokens.OWNER,{});
  if(dispatched.status!==200)throw Error(JSON.stringify(dispatched.body));
  const body={idempotencyKey:randomUUID(),items:[{transferItemId:approved.body.items[0].id,batchAllocationId:alloc.id,medicineId:t.medicine,batchId:b,quantityAccepted:4}]};
  const received=await call('post',`/transfers/${id}/receive`,t.tokens.OWNER,body);
  if(received.status!==200)throw Error(JSON.stringify(received.body));
  expect(received.body.transfer.status).toBe('RECEIVED');
  expect((await call('post',`/transfers/${id}/receive`,t.tokens.OWNER,body)).body.receipt.id).toBe(received.body.receipt.id);
  const positions=await sql`SELECT store_id,quantity_on_hand,quantity_in_transit FROM inventory_positions WHERE batch_id=${b}`;
  expect(positions.find(row=>row.store_id===t.store)).toMatchObject({quantity_on_hand:5,quantity_in_transit:0});
  expect(positions.find(row=>row.store_id===dest)).toMatchObject({quantity_on_hand:4,quantity_in_transit:0});
  expect((await sql`SELECT movement_type,quantity_delta FROM stock_ledger WHERE reference_id=${id} ORDER BY quantity_delta`).map(row=>[row.movement_type,row.quantity_delta])).toEqual([['TRANSFER_OUT',-4],['TRANSFER_IN',4]]);
 });
 test('the legacy cloud POS return shares the invoice cap and immutable credit note',async()=>{
  const t=await tenant(),b=await batch(t,9,180);
  const sale=await call('post','/sales',t.tokens.CASHIER,{paid_amount:20,items:[line(t.medicine,2)]});
  const item=sale.body.data.sale_items[0];
  const body={_local_id:randomUUID(),original_sale_id:sale.body.data.id,refund_method:'CASH',refund_reference:'QA-RETURN',items:[{sale_item_id:item.id,quantity:1,reason_code:'CUSTOMER_RETURN'}]};
  expect((await call('post','/pos/returns/quote',t.tokens.OWNER,body)).body.data.totalRefund).toBe(10);
  const returned=await call('post','/pos/returns',t.tokens.OWNER,body);
  if(returned.status!==201)throw Error(JSON.stringify(returned.body));
  expect(returned.body.data.totalRefund).toBe(10);expect(await stock(b)).toBe(7);
  expect((await call('post','/pos/returns',t.tokens.OWNER,body)).body.data.returnSaleId).toBe(returned.body.data.returnSaleId);
  expect((await call('post','/sales/returns',t.tokens.OWNER,{...body,_local_id:randomUUID(),refund_method:'cash',items:[{sale_item_id:item.id,quantity:2}]})).status).toBe(400);
  expect((await sql`SELECT refund_reference FROM sale_return_credit_notes WHERE return_sale_id=${returned.body.data.returnSaleId}`)[0].refund_reference).toBe('QA-RETURN');
 });
 test('10 units automatically allocate 3 + 7 in FEFO order, with exact ledger deductions',async()=>{
  const t=await tenant(),a=await batch(t,3,60),b=await batch(t,10,180),expired=await batch(t,20,-1),disposed=await batch(t,20,20,true);
  const response=await call('post','/sales',t.tokens.CASHIER,{_local_id:randomUUID(),paid_amount:100,items:[line(t.medicine,10)]});
  expect(response.status).toBe(201);expect(response.body.data.sale_items.map((item:any)=>[item.batch_id,item.quantity])).toEqual([[a,3],[b,7]]);
  expect([await stock(a),await stock(b),await stock(expired),await stock(disposed)]).toEqual([0,3,20,20]);
  const ledger=await sql`SELECT batch_id,quantity_delta FROM stock_ledger WHERE reference_id=${response.body.data.id} ORDER BY quantity_delta DESC`;
  expect(ledger.map(row=>[row.batch_id,row.quantity_delta])).toEqual([[a,-3],[b,-7]]);
 });
 test('concurrent tills cannot oversell or create orphan invoices',async()=>{
  const t=await tenant(),b=await batch(t,13,180);
  const results=await Promise.all(Array.from({length:20},()=>call('post','/sales',t.tokens.CASHIER,{_local_id:randomUUID(),paid_amount:10,items:[line(t.medicine,1)]})));
  const unexpected=results.filter(result=>![201,409].includes(result.status));
  expect(unexpected.map(result=>[result.status,result.body])).toEqual([]);
  expect(results.filter(result=>result.status===201)).toHaveLength(13);
  expect(results.filter(result=>result.status===409)).toHaveLength(7);
  expect(await stock(b)).toBe(0);
  expect(Number((await sql`SELECT COUNT(*) FROM sales WHERE clinic_id=${t.clinic}`)[0].count)).toBe(13);
 });
 test('an insufficient cart rolls back the entire invoice and supports safe manual selection',async()=>{
  const t=await tenant(),b=await batch(t,3,180);
  expect((await call('post','/sales',t.tokens.CASHIER,{paid_amount:50,items:[line(t.medicine,5,b)]})).status).toBe(409);
  expect(await stock(b)).toBe(3);expect((await sql`SELECT id FROM sales WHERE clinic_id=${t.clinic}`)).toHaveLength(0);
 });
 test('checkout replay is idempotent and changed details conflict',async()=>{
  const t=await tenant(),b=await batch(t,10,180),body={_local_id:randomUUID(),paid_amount:20,items:[line(t.medicine,2)]};
  const a=await call('post','/sales',t.tokens.CASHIER,body),again=await call('post','/sales',t.tokens.CASHIER,body);
  expect(a.status).toBe(201);expect(again.status).toBe(200);expect(a.body.data.id).toBe(again.body.data.id);expect(await stock(b)).toBe(8);
  expect((await call('post','/sales',t.tokens.CASHIER,{...body,paid_amount:10,items:[line(t.medicine,1)]})).status).toBe(409);
 });
 test.each(['SCHEDULE_H','SCHEDULE_H1','SCHEDULE_X','NARCOTIC'])('stored %s medicines cannot bypass restricted controls',async schedule=>{
  const t=await tenant();await batch(t,10,180);await sql`UPDATE medicines SET schedule_classification=${schedule} WHERE id=${t.medicine}`;
  for(const token of Object.values(t.tokens))expect((await call('post','/sales',token,{paid_amount:10,items:[{...line(t.medicine,1),prescription_required:false,schedule_classification:'NONE'}],pharmacist_approved:true})).status).toBe(409);
  expect((await sql`SELECT id FROM sales WHERE clinic_id=${t.clinic}`)).toHaveLength(0);
 });
 test('stocktake posts to PostgreSQL and the next sale observes corrected stock',async()=>{
  const t=await tenant(),b=await batch(t,10,180);
  const session=await call('post','/inventory/stocktakes',t.tokens.OWNER,{name:'Physical count',scope:{medicineIds:[t.medicine]}});
  expect(session.status).toBe(201);const id=session.body.data.id;
  expect((await call('post',`/inventory/stocktakes/${id}/start`,t.tokens.OWNER,{})).status).toBe(200);
  expect((await call('post',`/inventory/stocktakes/${id}/count`,t.tokens.OWNER,{medicineId:t.medicine,batchId:b,rawQuantity:4,requestId:randomUUID()})).status).toBe(200);
  expect((await call('post',`/inventory/stocktakes/${id}/approve`,t.tokens.CASHIER,{})).status).toBe(403);
  expect((await call('post',`/inventory/stocktakes/${id}/approve`,t.tokens.OWNER,{})).status).toBe(200);
  const posted=await call('post',`/inventory/stocktakes/${id}/post`,t.tokens.OWNER,{});expect(posted.status).toBe(200);expect(await stock(b)).toBe(4);
  expect((await call('post','/sales',t.tokens.CASHIER,{paid_amount:50,items:[line(t.medicine,5)]})).status).toBe(409);
  expect((await call('post','/sales',t.tokens.CASHIER,{paid_amount:40,items:[line(t.medicine,4)]})).status).toBe(201);expect(await stock(b)).toBe(0);
 });
 test('a ₹10,000 invoice with ₹4,000 payment has ₹6,000 due; duplicate payment cannot subtract twice',async()=>{
  const t=await tenant();
  const purchase=await call('post','/purchases',t.tokens.OWNER,{supplier_id:t.supplier,invoice_number:randomUUID(),items:[{medicine_id:t.medicine,batch_number:randomUUID(),expiry_date:expiry(180),quantity:1,purchase_price:10000,mrp:12000,gst_rate:0}]});
  expect(purchase.status).toBe(201);
  const payment={amount:4000,_local_id:randomUUID(),payment_mode:'cash'};
  const responses=await Promise.all([call('post',`/suppliers/${t.supplier}/payment`,t.tokens.OWNER,payment),call('post',`/suppliers/${t.supplier}/payment`,t.tokens.OWNER,payment)]);
  expect(responses.map(response=>response.status)).toEqual([200,200]);
  const [invoice]=await sql`SELECT * FROM purchases WHERE id=${purchase.body.data.id}`;expect(Number(invoice.paid_amount)).toBe(4000);
  expect(Number((await sql`SELECT outstanding_balance FROM suppliers WHERE id=${t.supplier}`)[0].outstanding_balance)).toBe(6000);
  expect(await sql`SELECT id FROM supplier_payments WHERE supplier_id=${t.supplier}`).toHaveLength(1);
  expect(Number((await sql`SELECT SUM(allocated_amount_paise) AS paid FROM supplier_payment_allocations WHERE purchase_id=${invoice.id}`)[0].paid)).toBe(400000);
 });
 test('customer identities, patient allergies and prescription history use the same PostgreSQL customer',async()=>{
  const t=await tenant();const customer=await call('post','/customers',t.tokens.OWNER,{name:'Patient QA',phone:'9876543210'});expect(customer.status).toBe(201);
  const id=customer.body.data.id;
  expect((await call('post',`/patients/${id}/allergies`,t.tokens.PHARMACIST,{allergen:'Penicillin',severity:'SEVERE'})).status).toBe(201);
  const rx=await call('post','/prescriptions',t.tokens.PHARMACIST,{patient_id:id,doctor_name:'QA Doctor',doctor_registration_number:'QA-RMP',items_json:[{raw_text:'QA medicine',prescribed_name:'QA medicine',prescribed_quantity:1,matched_product_id:t.medicine}]});expect(rx.status).toBe(201);
  expect((await call('post','/customers',t.tokens.OWNER,{name:' patient QA ',phone:'9876543210'})).status).toBe(409);
  const history=await call('get',`/patients/${id}/medication-history`,t.tokens.PHARMACIST);expect(history.status).toBe(200);expect(history.body.data.patientName).toBe('Patient QA');expect(history.body.data.allergies).toHaveLength(1);expect(history.body.data.prescriptions[0].id).toBe(rx.body.data.id);
  expect((await call('get',`/patients/${id}/allergies`,t.tokens.CASHIER)).status).toBe(403);
  const other=await tenant();expect((await call('get',`/patients/${id}/allergies`,other.tokens.PHARMACIST)).status).toBe(404);
 });
 test('supplier payment history, full settlement and a paid-invoice return credit agree',async()=>{
  const t=await tenant();
  const receive=async(price:number)=>call('post','/purchases',t.tokens.OWNER,{supplier_id:t.supplier,invoice_number:randomUUID(),
   items:[{medicine_id:t.medicine,batch_number:randomUUID(),expiry_date:expiry(180),quantity:1,purchase_price:price,mrp:price+100,gst_rate:0}]});
  const first=await receive(10000);
  if(first.status!==201)throw Error(JSON.stringify(first.body));
  const firstId=first.body.data.id;
  for(const amount of [4000,6000])expect((await call('post',`/suppliers/${t.supplier}/payment`,t.tokens.OWNER,{amount,_local_id:randomUUID(),payment_mode:'cash'})).status).toBe(200);
  const history=await call('get',`/purchases/${firstId}`,t.tokens.OWNER);
  if(history.status!==200)throw Error(JSON.stringify(history.body));
  expect(history.body.data.outstanding_amount).toBe(0);expect(history.body.data.payment_history.map((row:any)=>Number(row.allocated_amount_paise)).sort()).toEqual([400000,600000]);
  const [firstBatch]=await sql`SELECT id FROM medicine_batches WHERE purchase_id=${firstId}`;
  const returned=await call('post','/purchases/purchase-returns',t.tokens.OWNER,{supplier_id:t.supplier,lines:[{batchId:firstBatch.id,quantity:1}]});
  if(returned.status!==201)throw Error(JSON.stringify(returned.body));
  const second=await receive(12000);
  if(second.status!==201)throw Error(JSON.stringify(second.body));
  const [bill]=await sql`SELECT supplier_credit_paise FROM purchases WHERE id=${second.body.data.id}`;
  expect(Number(bill.supplier_credit_paise)).toBe(1000000);
  expect(Number((await sql`SELECT outstanding_balance FROM suppliers WHERE id=${t.supplier}`)[0].outstanding_balance)).toBe(2000);
 });
 test('the database rejects a restricted sale item even when the API guard is bypassed',async()=>{
  const t=await tenant(),b=await batch(t,10,180);
  const ordinary=await call('post','/sales',t.tokens.OWNER,{paid_amount:10,items:[line(t.medicine,1)]});
  expect(ordinary.status).toBe(201);
  await sql`UPDATE medicines SET prescription_required=true WHERE id=${t.medicine}`;
  const legacy=await call('post','/pos/checkout',t.tokens.OWNER,{items:[line(t.medicine,1)],payments:[{tender_type:'CASH',amount:10}]});
  expect(legacy.status).toBe(409);
  await expect(sql`INSERT INTO sale_items (sale_id,clinic_id,medicine_id,batch_id,quantity,unit_price,total)
   VALUES (${ordinary.body.data.id},${t.clinic},${t.medicine},${b},1,10,10)`).rejects.toThrow('RESTRICTED_DISPENSING_BLOCKED');
 });
 test('legacy cloud checkout uses both actual allocations in the return options',async()=>{
  const t=await tenant(),a=await batch(t,3,90),b=await batch(t,10,180);
  const body={items:[{medicine_id:t.medicine,quantity:10}],payments:[{tender_type:'CASH',amount:100}],_local_id:randomUUID()};
  const checkout=await call('post','/pos/checkout',t.tokens.OWNER,body);
  if(checkout.status!==201)throw Error(JSON.stringify(checkout.body));
  expect([await stock(a),await stock(b)]).toEqual([0,3]);
  const options=await call('get',`/sales/${checkout.body.data.sale.id}/return-options`,t.tokens.OWNER);
  if(options.status!==200)throw Error(JSON.stringify(options.body));
  expect(options.body.data.items.map((item:any)=>[item.batch_id,item.sold_quantity]).sort()).toEqual([[a,3],[b,7]].sort());
 });
 test('cashier can make a partial non-restock return with exact refund, immutable credit note and replay protection',async()=>{
  const t=await tenant(),b=await batch(t,10,180);
  const sale=await call('post','/sales',t.tokens.CASHIER,{paid_amount:30,items:[line(t.medicine,3)]});expect(sale.status).toBe(201);
  const item=sale.body.data.sale_items[0],body={_local_id:randomUUID(),original_sale_id:sale.body.data.id,refund_method:'cash',items:[{sale_item_id:item.id,batch_id:b,quantity:1,reason:'Unopened customer return',restock:false}]};
  const quote=await call('post','/sales/returns/quote',t.tokens.CASHIER,body);expect(quote.status).toBe(200);expect(quote.body.data.external_refund_paise).toBe(1000);
  const returned=await call('post','/sales/returns',t.tokens.CASHIER,body);expect(returned.status).toBe(200);expect(returned.body.data.credit_note.total_refund_paise).toBe('1000');expect(await stock(b)).toBe(7);
  expect((await call('post','/sales/returns',t.tokens.CASHIER,body)).body.data.id).toBe(returned.body.data.id);
  expect((await call('post','/sales/returns',t.tokens.CASHIER,{...body,_local_id:randomUUID(),items:[{...body.items[0],quantity:3}]})).status).toBe(400);
  await expect(sql`UPDATE sale_return_credit_notes SET reason='tampered' WHERE return_sale_id=${returned.body.data.id}`).rejects.toThrow('append-only');
 });
 test('quoted checkout uses actual prices across multiple batches and rejects a stale total',async()=>{
  const t=await tenant(),a=await batch(t,3,60),b=await batch(t,10,180);
  await sql`UPDATE medicine_batches SET mrp=12 WHERE id=${b}`;
  const body={items:[line(t.medicine,10)]};
  const quote=await call('post','/sales/quote',t.tokens.CASHIER,body);
  expect(quote.status).toBe(200);expect(quote.body.data.expected_total_paise).toBe(11400);
  expect((await call('post','/sales',t.tokens.CASHIER,{...body,paid_amount:100,expected_total_paise:10000})).status).toBe(409);
  const sale=await call('post','/sales',t.tokens.CASHIER,{...body,paid_amount:114,expected_total_paise:11400});
  expect(sale.status).toBe(201);expect(sale.body.data.sale_items.map((item:any)=>[item.batch_id,Number(item.unit_price)])).toEqual([[a,10],[b,12]]);
 });
 test('offline inbox commits one sale after a lost acknowledgement and preserves conflicts',async()=>{
  const t=await tenant(),b=await batch(t,3,180);
  const command={command_id:randomUUID(),device_id:'desktop-qa',type:'SALE',payload:{paid_amount:20,items:[line(t.medicine,2)]}};
  const first=await call('post','/offline/commands',t.tokens.CASHIER,command);expect(first.status).toBe(200);expect(first.body.data.status).toBe('APPLIED');
  const retry=await call('post','/offline/commands',t.tokens.CASHIER,command);expect(retry.body.data.replayed).toBe(true);expect(retry.body.data.data.id).toBe(first.body.data.data.id);
  expect(await stock(b)).toBe(1);
  const conflictId=randomUUID(),conflict=await call('post','/offline/commands',t.tokens.CASHIER,{...command,command_id:conflictId});
  expect(conflict.body.data.status).toBe('CONFLICT');
  expect((await sql`SELECT status,payload FROM offline_command_inbox WHERE clinic_id=${t.clinic} AND command_id=${conflictId}`)[0]).toMatchObject({status:'CONFLICT',payload:command.payload});
  expect((await sql`SELECT id FROM sales WHERE clinic_id=${t.clinic}`)).toHaveLength(1);
  expect((await call('post','/offline/commands',t.tokens.CASHIER,{...command,payload:{paid_amount:10,items:[line(t.medicine,1)]}})).status).toBe(409);
  expect((await call('post','/offline/commands',t.tokens.OWNER,command)).status).toBe(409);
 });
 test('stocktake count replays once and refuses a stale snapshot after a sale',async()=>{
  const t=await tenant(),b=await batch(t,10,180);
  const session=await call('post','/inventory/stocktakes',t.tokens.OWNER,{name:'Recount QA'});
  const path=`/inventory/stocktakes/${session.body.data.id}`;
  expect((await call('post',`${path}/start`,t.tokens.OWNER,{})).status).toBe(200);
  const body={medicineId:t.medicine,batchId:b,rawQuantity:4,requestId:randomUUID()};
  const a=await call('post',`${path}/count`,t.tokens.OWNER,body),replay=await call('post',`${path}/count`,t.tokens.OWNER,body);
  expect(a.status).toBe(200);expect(replay.body.data.countId).toBe(a.body.data.countId);expect(replay.body.data.physicalQuantity).toBe(4);
  expect((await call('post',`${path}/approve`,t.tokens.OWNER,{})).status).toBe(200);
  expect((await call('post','/sales',t.tokens.CASHIER,{paid_amount:10,items:[line(t.medicine,1)]})).status).toBe(201);
  expect((await call('post',`${path}/post`,t.tokens.OWNER,{})).status).toBe(409);expect(await stock(b)).toBe(9);
 });
 test('approval and stock ledger restore the exact batch once on a full return',async()=>{
  const t=await tenant(),b=await batch(t,5,180);
  const sale=await call('post','/sales',t.tokens.CASHIER,{paid_amount:20,items:[line(t.medicine,2)]});
  const body={_local_id:randomUUID(),original_sale_id:sale.body.data.id,refund_method:'cash',items:[{sale_item_id:sale.body.data.sale_items[0].id,batch_id:b,quantity:2,reason:'Counter correction',restock:true}]};
  expect((await call('post','/sales/returns',t.tokens.CASHIER,body)).status).toBe(403);expect(await stock(b)).toBe(3);
  const returned=await call('post','/sales/returns',t.tokens.PHARMACIST,body);expect(returned.status).toBe(200);
  expect(returned.body.data.credit_note.approved_by).toBe(t.pharmacist);expect(await stock(b)).toBe(5);
  const print=await call('get',`/sales/${returned.body.data.id}/invoice`,t.tokens.PHARMACIST);expect(print.status).toBe(200);expect(print.text).toContain('Credit note');expect(print.text).toContain(sale.body.data.invoice_number);
  expect((await sql`SELECT quantity_delta FROM stock_ledger WHERE reference_id=${returned.body.data.id}`)[0].quantity_delta).toBe(2);
 });
 test('a payment allocation constraint failure rolls back invoice and payable balances',async()=>{
  const t=await tenant();const purchase=await call('post','/purchases',t.tokens.OWNER,{supplier_id:t.supplier,invoice_number:randomUUID(),items:[{medicine_id:t.medicine,batch_number:randomUUID(),expiry_date:expiry(180),quantity:1,purchase_price:100,mrp:120,gst_rate:0}]});
  expect(purchase.status).toBe(201);
  const trigger=`qa_fail_allocation_${t.supplier.replaceAll('-','')}`;
  await sql.unsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.purchase_id='${purchase.body.data.id}' THEN RAISE EXCEPTION 'forced allocation failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON supplier_payment_allocations FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  try{expect((await call('post',`/suppliers/${t.supplier}/payment`,t.tokens.OWNER,{amount:40,_local_id:randomUUID()})).status).toBe(500);}
  finally{await sql.unsafe(`DROP TRIGGER ${trigger} ON supplier_payment_allocations; DROP FUNCTION ${trigger}()`);}
  expect(Number((await sql`SELECT paid_amount FROM purchases WHERE id=${purchase.body.data.id}`)[0].paid_amount)).toBe(0);
  expect(Number((await sql`SELECT outstanding_balance FROM suppliers WHERE id=${t.supplier}`)[0].outstanding_balance)).toBe(100);
  expect(await sql`SELECT id FROM supplier_payments WHERE supplier_id=${t.supplier}`).toHaveLength(0);
 });
});
