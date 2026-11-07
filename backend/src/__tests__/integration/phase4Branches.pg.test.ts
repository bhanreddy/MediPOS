import { randomUUID } from 'node:crypto';
const database=process.env.TEST_DATABASE_URL;
if(database){const url=new URL(database);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_qa'))throw new Error('Phase 4 requires disposable local *_qa database');process.env.DATABASE_URL=database;}
process.env.WALLET_LEDGER_SECRET='a'.repeat(64);
jest.mock('../../middleware/planEnforcement',()=>({enforcePlan:(_req:unknown,_res:unknown,next:()=>void)=>next()}));
import { createApp } from '../../app';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sql from '../../db';
const pg=database?describe:describe.skip;
const expiry=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
pg('Phase 4 real PostgreSQL integrity',()=>{
 const app=createApp();
 const call=(method:'get'|'post'|'patch'|'put',path:string,token:string,body?:object,branch?:string)=>request(app)[method](`/api${path}`).set('Authorization',`Bearer ${token}`).set(branch ? {'x-store-id':branch} : {}).send(body);
 async function tenant(){
  const org=randomUUID(),clinic=randomUUID(),store=randomUUID(),owner=randomUUID(),cashier=randomUUID(),pharmacist=randomUUID(),supplier=randomUUID(),medicine=randomUUID();
  await sql`INSERT INTO organizations(id,_local_id,legal_name,display_name,code) VALUES(${org},${org},'Phase 4 QA','Phase 4 QA',${org})`;
  await sql`INSERT INTO clinics(id,_local_id,name,slug,organization_id) VALUES(${clinic},${clinic},'Phase 4 QA',${clinic},${org})`;
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
 async function addStore(t: Awaited<ReturnType<typeof tenant>>, name: string, roles: string[]) {
   const id = randomUUID();
   await sql`INSERT INTO stores(id,_local_id,organization_id,clinic_id,store_code,name) VALUES(${id},${id},${t.org},${t.clinic},${id},${name})`;
   for (const role of roles) {
     const membership = randomUUID(), user = role === 'CASHIER' ? t.cashier : t.pharmacist;
     await sql`INSERT INTO user_store_access(id,_local_id,user_id,organization_id,store_id,role)
      VALUES(${membership},${membership},${user},${t.org},${id},${role})`;
   }
   return id;
 }

 test('the branch directory, POS, invoices and dashboard isolate selected and unauthorized stores', async () => {
   const t = await tenant(), west = await addStore(t, 'West', ['PHARMACIST']), hidden = await addStore(t,'Private',[]);
   const another = await tenant();
   const eastBatch = await batch(t, 3, 90), westBatch = await batch(t, 12, 180);
   await sql`UPDATE medicine_batches SET store_id=${west} WHERE id=${westBatch}`;
   const privateBatch = await batch(t, 90, 180);
   await sql`UPDATE medicine_batches SET store_id=${hidden} WHERE id=${privateBatch}`;
   expect((await call('get','/branches/accessible',t.tokens.CASHIER)).body.data.map((row:any)=>row.id)).toEqual([t.store]);
   expect((await call('get','/branches/accessible',t.tokens.PHARMACIST)).body.data.map((row:any)=>row.id)).toEqual([t.store,west]);
   expect((await call('get','/inventory/medicines/search?q=QA&include_substitutes=false',t.tokens.CASHIER,undefined,west)).status).toBe(403);
   expect((await call('get','/register/active',t.tokens.OWNER,undefined,another.store)).status).toBe(403);
   const warehouse = randomUUID();
   await sql`INSERT INTO warehouses(id,_local_id,organization_id,warehouse_code,name,manager_user_id)
     VALUES(${warehouse},${warehouse},${t.org},'QA-WH','QA Warehouse',${t.pharmacist})`;
   const warehouseInventory = `/inventory/availability?medicine_id=${t.medicine}&warehouse_id=${warehouse}`;
   expect((await call('get',warehouseInventory,t.tokens.CASHIER,undefined,t.store)).status).toBe(403);
   expect((await call('get',warehouseInventory,t.tokens.PHARMACIST,undefined,t.store)).status).toBe(200);
   expect((await call('get',`${warehouseInventory}&store_id=${west}`,t.tokens.PHARMACIST,undefined,t.store)).status).toBe(400);
   expect((await call('get',`/inventory/alerts?warehouse_id=${warehouse}`,t.tokens.PHARMACIST,undefined,t.store)).status).toBe(400);
   const recall = randomUUID(), task = randomUUID();
   await sql`INSERT INTO product_recalls(id,_local_id,organization_id,recall_reference,product_id,reason,created_by)
     VALUES(${recall},${recall},${t.org},'QA recall',${t.medicine},'QA isolation',${t.owner})`;
   await sql`INSERT INTO recall_tasks(id,_local_id,recall_id,organization_id,store_id,location_type)
     VALUES(${task},${task},${recall},${t.org},${west},'STORE')`;
   expect((await call('post',`/inventory/recalls/tasks/${task}/complete`,another.tokens.OWNER,{quarantinedUnits:0},another.store)).status).toBe(404);
   expect((await call('post',`/inventory/recalls/tasks/${task}/complete`,t.tokens.CASHIER,{quarantinedUnits:0},t.store)).status).toBe(403);
   expect((await call('get',`/inventory/recalls/${recall}/trace/prescriptions`,t.tokens.CASHIER,undefined,t.store)).status).toBe(403);
   expect((await call('get',`/inventory/recalls/${recall}/trace/prescriptions`,t.tokens.PHARMACIST,undefined,t.store)).status).toBe(200);
   const peers = await call('get',`/branches/sister-stock/${t.medicine}`,t.tokens.PHARMACIST,undefined,t.store);
   expect(peers.body.data).toEqual([expect.objectContaining({store_id:west,available_quantity:12})]);
   expect((await call('get',`/branches/sister-stock/${t.medicine}`,t.tokens.CASHIER,undefined,t.store)).body.data).toEqual([]);
   const search = await call('get','/inventory/medicines/search?q=QA&include_substitutes=false',t.tokens.PHARMACIST,undefined,west);
   if(search.status!==200)throw Error(JSON.stringify(search.body));
   expect(Number(search.body.results[0].total_stock)).toBe(12);
   const sisterRequest = {source_store_id:west,quantity:12,request_id:randomUUID()};
   const requestSister = () => call('post',`/branches/sister-stock/${t.medicine}/request`,t.tokens.PHARMACIST,sisterRequest,t.store);
   const initial = await requestSister();
   expect(initial.status).toBe(201);
   const catalogue = await call('get','/inventory/medicines',t.tokens.PHARMACIST,undefined,west);
   if(catalogue.status!==200)throw Error(JSON.stringify(catalogue.body));
   expect(catalogue.body.data[0].total_stock).toBe(12);
   const page = await call('get','/inventory/medicines?page_size=1',t.tokens.PHARMACIST,undefined,west);
   expect(page.status).toBe(200);
   expect(page.body.data[0]).toMatchObject({id:t.medicine,total_stock:12});
   expect(page.body.next_cursor).toBeNull();
   expect((await call('get','/inventory/medicines?page_size=501',t.tokens.PHARMACIST,undefined,west)).status).toBe(400);
   const sale = await call('post','/sales',t.tokens.PHARMACIST,{_local_id:randomUUID(),paid_amount:50,items:[line(t.medicine,5)]},west);
   if(sale.status!==201)throw Error(JSON.stringify(sale.body));
   expect(await stock(westBatch)).toBe(7);
   const replay = await requestSister();
   expect(replay.status).toBe(201);
   expect(replay.body.data.id).toBe(initial.body.data.id);
   expect(await stock(eastBatch)).toBe(3);
   expect((await call('get',`/sales/${sale.body.data.id}`,t.tokens.CASHIER)).status).toBe(403);
   expect((await call('get','/sales',t.tokens.CASHIER)).body.data).toEqual([]);
   expect((await call('get','/reports/dashboard',t.tokens.PHARMACIST,undefined,t.store)).body.data.today_bills).toBe(0);
   expect((await call('get','/reports/dashboard',t.tokens.PHARMACIST,undefined,west)).body.data.today_bills).toBe(1);
   const today = expiry(0);
   const chain = await call('get',`/branches/analytics?from=${today}&to=${today}`,t.tokens.OWNER);
   if(chain.status!==200)throw Error(JSON.stringify(chain.body));
   expect(chain.body.data.totals).toMatchObject({net_sales:50,invoices:1,stock_units:100,inventory_cost:500,cost_of_goods:25,operating_contribution:25});
   expect((await call('get',`/branches/analytics?from=${today}&to=${today}`,t.tokens.CASHIER)).status).toBe(403);
 });

 test('dispatch, partial receipt, replay and cancellation leave correct PostgreSQL balances and branch permissions', async () => {
   const t = await tenant(), destination = await addStore(t,'Receiving',[]), hidden = await addStore(t,'Unrelated',[]);
   const batchId = await batch(t, 20, 180);
   const order = { idempotencyKey:randomUUID(), transferType:'STORE_TO_STORE', sourceLocationType:'STORE', sourceLocationId:t.store,
     destinationLocationType:'STORE', destinationLocationId:destination, items:[{medicineId:t.medicine,requestedQuantity:8}] };
   expect((await call('post','/transfers',t.tokens.CASHIER,order,t.store)).status).toBe(403);
   const created = await call('post','/transfers',t.tokens.OWNER,order,t.store);
   if(created.status!==201)throw Error(JSON.stringify(created.body));
   const id = created.body.id;
   expect((await call('post','/transfers',t.tokens.OWNER,{...order,items:[{medicineId:t.medicine,requestedQuantity:9}]},t.store)).status).toBe(409);
   expect((await call('get',`/transfers/${id}`,t.tokens.OWNER,undefined,hidden)).status).toBe(403);
   expect((await call('get','/transfers',t.tokens.OWNER,undefined,hidden)).body.total).toBe(0);
   expect((await call('post',`/transfers/${id}/approve`,t.tokens.CASHIER,{},t.store)).status).toBe(403);
   const approved = await call('post',`/transfers/${id}/approve`,t.tokens.OWNER,{},t.store);
   if(approved.status!==200)throw Error(JSON.stringify(approved.body));
   const allocation = approved.body.allocations[0];
   const before = await sql`SELECT available,on_hand FROM branch_stock_snapshot WHERE batch_id=${batchId} AND store_id=${t.store}`;
   expect(before[0]).toMatchObject({on_hand:20,available:12});
   const dispatch = {idempotencyKey:randomUUID(),trackingReference:'QA shipment'};
   const [sent,retry] = await Promise.all([
     call('post',`/transfers/${id}/dispatch`,t.tokens.OWNER,dispatch,t.store),
     call('post',`/transfers/${id}/dispatch`,t.tokens.OWNER,dispatch,t.store),
   ]);
   expect([sent.status,retry.status]).toEqual([200,200]);
   expect((await call('post','/transfers',t.tokens.OWNER,order,t.store)).body.id).toBe(id);
   expect((await call('post',`/transfers/${id}/cancel`,t.tokens.OWNER,{},t.store)).status).toBe(400);
   const receive = {idempotencyKey:randomUUID(),items:[{transferItemId:approved.body.items[0].id,batchAllocationId:allocation.id,
     medicineId:t.medicine,batchId,quantityAccepted:3}]};
   expect((await call('post',`/transfers/${id}/receive`,t.tokens.CASHIER,receive,t.store)).status).toBe(403);
   const partial = await call('post',`/transfers/${id}/receive`,t.tokens.OWNER,receive,destination);
   if(partial.status!==200)throw Error(JSON.stringify(partial.body));
   expect(partial.body.transfer.status).toBe('PARTIALLY_RECEIVED');
   expect((await call('post',`/transfers/${id}/receive`,t.tokens.OWNER,receive,destination)).body.receipt.id).toBe(partial.body.receipt.id);
   expect((await call('post',`/transfers/${id}/receive`,t.tokens.OWNER,{...receive,items:[{...receive.items[0],quantityAccepted:4}]},destination)).status).toBe(409);
   const final = await call('post',`/transfers/${id}/receive`,t.tokens.OWNER,{idempotencyKey:randomUUID(),items:[{...receive.items[0],quantityAccepted:5}]},destination);
   expect(final.body.transfer.status).toBe('RECEIVED');
   const balances = await sql`SELECT store_id,on_hand,available FROM branch_stock_snapshot WHERE batch_id=${batchId}`;
   expect(balances.find(row=>row.store_id===t.store)).toMatchObject({on_hand:12,available:12});
   expect(balances.find(row=>row.store_id===destination)).toMatchObject({on_hand:8,available:8});
   const dispose = (batch: string, branch: string) =>
     call('post',`/inventory/batches/${batch}/dispose`,t.tokens.OWNER,{reason:'DAMAGED'},branch);
   expect((await dispose(batchId,hidden)).status).toBe(403);
   expect((await dispose(batchId,t.store)).status).toBe(409);
   const isolated = await batch(t,4,60);
   expect((await dispose(isolated,t.store)).status).toBe(200);
   expect(await stock(isolated)).toBe(0);
   expect((await sql`SELECT movement_type,quantity_delta,store_id FROM stock_ledger WHERE reference_id=${isolated}`)[0])
     .toMatchObject({movement_type:'DISPOSAL',quantity_delta:-4,store_id:t.store});
   const movements = await sql`SELECT movement_type,quantity_delta,balance_after FROM stock_ledger WHERE reference_id=${id} ORDER BY created_at,id`;
   expect(movements.map(row=>[row.movement_type,row.quantity_delta,row.balance_after])).toEqual([
     ['TRANSFER_OUT',-8,12],['TRANSFER_IN',3,3],['TRANSFER_IN',5,8],
   ]);
   const pending = await call('post','/transfers',t.tokens.OWNER,{...order,idempotencyKey:randomUUID()},t.store);
   expect((await call('post',`/transfers/${pending.body.id}/approve`,t.tokens.OWNER,{},t.store)).status).toBe(200);
   expect((await call('post',`/transfers/${pending.body.id}/reject`,t.tokens.OWNER,{reason:'Replaced'},t.store)).status).toBe(200);
   expect(Number((await sql`SELECT available FROM branch_stock_snapshot WHERE batch_id=${batchId} AND store_id=${t.store}`)[0].available)).toBe(12);
 });
});
