import { once } from 'node:events';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
const database=process.env.TEST_DATABASE_URL;
if(database){const url=new URL(database);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_qa'))throw new Error('Phase 3 requires disposable local *_qa database');process.env.DATABASE_URL=database;}
process.env.WALLET_LEDGER_SECRET='a'.repeat(64);
jest.mock('../../middleware/planEnforcement',()=>({enforcePlan:(_req:unknown,_res:unknown,next:()=>void)=>next()}));
import { createApp } from '../../app';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sql from '../../db';
const pg=database?describe:describe.skip;
const expiry=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
pg('Phase 3 real PostgreSQL integrity',()=>{
 const app=createApp();
 let server: Server;
 beforeAll(async () => {
   server = app.listen(0, '127.0.0.1');
   await once(server, 'listening');
 });
 const call=(method:'get'|'post'|'patch'|'put',path:string,token:string,body?:object)=>request(server)[method](`/api${path}`).set('Authorization',`Bearer ${token}`).send(body);
 async function tenant(){
  const org=randomUUID(),clinic=randomUUID(),store=randomUUID(),owner=randomUUID(),cashier=randomUUID(),pharmacist=randomUUID(),supplier=randomUUID(),medicine=randomUUID();
  await sql`INSERT INTO organizations(id,_local_id,legal_name,display_name,code) VALUES(${org},${org},'Phase 3 QA','Phase 3 QA',${org})`;
  await sql`INSERT INTO clinics(id,_local_id,name,slug,organization_id) VALUES(${clinic},${clinic},'Phase 3 QA',${clinic},${org})`;
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
 test.each(['SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X'])('a registered pharmacist supplies %s against its exact verified document', async classification => {
   const t = await tenant();
   const x = classification === 'SCHEDULE_X';
   let batchId: string;
   await sql`UPDATE medicines SET schedule_classification=${classification}, manufacturer='QA Manufacturer' WHERE id=${t.medicine}`;
   if (x) {
     await sql`UPDATE suppliers SET address='QA Supplier address', drug_licence_number='QA-WHOLESALE' WHERE id=${t.supplier}`;
     const purchase = await call('post','/purchases',t.tokens.OWNER,{supplier_id:t.supplier,invoice_number:'QA-X-INWARD',
       items:[{medicine_id:t.medicine,batch_number:'QA-X-BATCH',expiry_date:expiry(180),quantity:20,purchase_price:5,mrp:10,gst_rate:0}]});
     if(purchase.status!==201)throw Error(JSON.stringify(purchase.body));
     batchId = (await sql`SELECT id FROM medicine_batches WHERE purchase_id=${purchase.body.data.id}`)[0].id;
   } else {
     batchId = await batch(t, 20, 180);
   }
   await sql`UPDATE stores SET address='QA Pharmacy address', drug_licence_number='QA-DL', state_code='36' WHERE id=${t.store}`;
   const settings = { enabled: true, physical_records_confirmed: true, ...(x ? {schedule_x_licence:"QA-FORM-20F",schedule_x_secure_storage:true} : {}) };
   expect((await call('put','/dispensing/setup',t.tokens.CASHIER,settings)).status).toBe(403);
   expect((await call('put','/dispensing/setup',t.tokens.OWNER,settings)).status).toBe(200);
   const credential = { registration_number:'QA-REG-123',registration_authority:'QA State Pharmacy Council',active:true,verified_original:true };
   expect((await call('put',`/dispensing/pharmacists/${t.pharmacist}`,t.tokens.OWNER,credential)).status).toBe(200);
   const patient = await call('post','/customers',t.tokens.OWNER,{ name:'QA Patient',phone:'9876500045',address:'QA Patient address' });
   if(patient.status!==201) throw Error(JSON.stringify(patient.body));
   const patientId = patient.body.data.id;
   const authorization = `Bearer ${t.tokens.PHARMACIST}`;
   const createRx = async () => request(server).post('/api/prescriptions')
     .set('Authorization', authorization)
     .field('patient_id', patientId).field('doctor_name','QA Dr').field('doctor_registration_number','QA-RMP')
     .field('doctor_address','QA Prescriber address').field('written_date','2025-12-03').field('external_rx_number','QA-PRESCRIPTION')
     .field('items_json', JSON.stringify([{raw_text:'QA medicine',prescribed_name:'QA medicine',prescribed_quantity:4,dose_text:'QA written dose',matched_product_id:t.medicine}]))
     .attach('file',Buffer.from('%PDF-1.4\nsynthetic signed prescription'),{filename:'synthetic.pdf',contentType:'application/pdf'});
   const created = await createRx();
   if(created.status!==201) throw Error(JSON.stringify(created.body));
   const rx = created.body.data;
   const checkout = { _local_id:randomUUID(), customer_id:patientId, prescription_id:rx.id, paid_amount:40,
     items:[line(t.medicine,4)], dispensing_attestation:{signed_original_checked:true,annotated_and_signed:true,
       ...(x ? {x_register_page:'P10/1', x_duplicate_reference:'Duplicate shelf / QA'} : {prescription_register:'P001'}),
       ...(classification === 'SCHEDULE_H1' ? {h1_register:'H1001'} : {})} };
   expect((await call('post','/sales',t.tokens.PHARMACIST,checkout)).status).toBe(409);
   const verified = await call('post',`/prescriptions/${rx.id}/verify`,t.tokens.PHARMACIST,{});
   expect(verified.status).toBe(200);
   expect((await call('post','/sales',t.tokens.CASHIER,checkout)).status).toBe(409);
   if (x) expect((await call('post','/sales',t.tokens.PHARMACIST,{...checkout,dispensing_attestation:{
     ...checkout.dispensing_attestation,x_duplicate_reference:undefined,
   }})).status).toBe(409);
   expect((await call('post','/sales',t.tokens.PHARMACIST,{...checkout,items:[line(t.medicine,5)]})).status).toBe(409);
   const offline = await call('post','/offline/commands',t.tokens.PHARMACIST,{command_id:randomUUID(),device_id:'QA',type:'SALE',payload:checkout});
   expect(offline.body.data.status).toBe('CONFLICT');
   const posted = await call('post','/sales',t.tokens.PHARMACIST,checkout);
   if(posted.status!==201) throw Error(JSON.stringify(posted.body));
   expect(await stock(batchId)).toBe(16);
   expect((await call('post','/sales',t.tokens.PHARMACIST,{...checkout,_local_id:randomUUID()})).status).toBe(409);
   const audit = await sql`SELECT d.evidence,l.classification,l.evidence AS line,l.quantity
     FROM regulated_dispensing d JOIN regulated_dispensing_lines l ON l.dispensing_id=d.id WHERE d.sale_id=${posted.body.data.id}`;
   expect(audit[0]).toMatchObject({ classification,quantity:4,
     evidence:{patient_name:'QA Patient',prescriber_address:'QA Prescriber address'},
     line:{manufacturer:'QA Manufacturer',prescribed_dose:'QA written dose'} });
   const registerPath = x ? '/reports/schedule-x' : classification === 'SCHEDULE_H1' ? '/reports/schedule-h1' : '/reports/prescription-register';
   const register = await call('get',registerPath,t.tokens.PHARMACIST);
   expect(register.body.data).toEqual([expect.objectContaining({ patient_name:'QA Patient', quantity:4, classification })]);
   if (x) expect(register.body.data[0]).toMatchObject({purchase_invoice:'QA-X-INWARD',supplier_licence:'QA-WHOLESALE',x_register_page:'P10/1'});
   const csv = await call('get',`${registerPath}?format=csv`,t.tokens.OWNER);
   expect(csv.header['content-type']).toContain('text/csv');
   expect(csv.text).toContain('QA Prescriber address');
   expect((await call('get',registerPath,t.tokens.CASHIER)).status).toBe(403);
   const note = await call('get',`/sales/${posted.body.data.id}/invoice`,t.tokens.PHARMACIST);
   expect(note.text).toContain('QA-REG-123');
   expect(note.text).toContain('QA Manufacturer');
 });

 test('invoice and credit note snapshots preserve intra-State and inter-State taxes in integer paise', async () => {
   const t = await tenant();
   const batchId = await batch(t, 50, 180);
   await sql`UPDATE stores SET address='QA Pharmacy',gstin_override='36ABCDE1234F1Z5',state_code='36' WHERE id=${t.store}`;
   await sql`UPDATE medicines SET gst_rate=5, hsn_code='300490', manufacturer='QA Manufacturer' WHERE id=${t.medicine}`;
   await sql`UPDATE medicine_batches SET mrp=105 WHERE id=${batchId}`;
   const customer = await call('post','/customers',t.tokens.OWNER,{name:'QA Retail buyer',phone:'9876500091',address:'Test delivery address',gstin:'29ABCDE1234F1Z5'});
   const customerId = customer.body.data.id;
   const item = {...line(t.medicine,2),mrp:105,gst_rate:5};
   const inter = await call('post','/sales',t.tokens.OWNER,{_local_id:randomUUID(),customer_id:customerId,place_of_supply_state_code:'29',
     delivery_address:'QA Karnataka',paid_amount:210,items:[item]});
   if(inter.status!==201) throw Error(JSON.stringify(inter.body));
   expect(inter.body.data.invoice_number).toMatch(/^S[0-9]{4}-[0-9]{10}$/);
   expect(inter.body.data.invoice_snapshot).toMatchObject({taxable_paise:20000,igst_paise:1000,cgst_paise:0,sgst_paise:0});
   expect(inter.body.data.sale_items[0].invoice_line_snapshot).toMatchObject({hsn_code:'300490',gross_paise:21000,igst_paise:1000});
   const local = await call('post','/sales',t.tokens.OWNER,{_local_id:randomUUID(),paid_amount:210,items:[item]});
   expect(local.body.data.invoice_snapshot).toMatchObject({taxable_paise:20000,igst_paise:0,cgst_paise:500,sgst_paise:500});
   const returned = await call('post','/sales/returns',t.tokens.OWNER,{_local_id:randomUUID(),original_sale_id:inter.body.data.id,
     items:[{sale_item_id:inter.body.data.sale_items[0].id,quantity:1,reason:'QA return'}]});
   expect(returned.body.data.invoice_snapshot).toMatchObject({taxable_paise:10000,igst_paise:500});
   await sql`UPDATE medicines SET hsn_code='999999',manufacturer='Updated product' WHERE id=${t.medicine}`;
   const rendered = await call('get',`/sales/${inter.body.data.id}/invoice`,t.tokens.OWNER);
   expect(rendered.text).toContain('QA Manufacturer');
   expect(rendered.text).toContain('Tax invoice');
   expect(rendered.text).toContain('IGST');
   expect(rendered.text).not.toContain('Updated product');
   const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit' })
     .formatToParts(new Date()).filter(part => ['year','month'].includes(part.type))
     .sort((a,b)=>b.type.localeCompare(a.type)).map(part=>part.value);
   const exportData = await call('get',`/reports/gstr1-export?month=${month}&year=${year}`,t.tokens.OWNER);
   if(exportData.status!==200) throw Error(JSON.stringify(exportData.body));
   const data = exportData.body.data;
   expect(data.b2b[0].inv[0].itms[0].itm_det).toMatchObject({txval:200,iamt:10,camt:0,samt:0});
   expect(data.cdnr[0].nt[0].itms[0].itm_det).toMatchObject({txval:100,iamt:5});
   expect(data.b2cs[0]).toMatchObject({txval:200,camt:5,samt:5});
   expect(data.hsn.hsn_b2b[0].hsn_sc).toBe('300490');
   for (const kind of ['expiry','dead-stock','slow-moving','employee-sales','party-ledger','customer-outstanding',
     'supplier-outstanding','valuation','stock-movement','returns']) {
     const report = await call('get',`/reports/operations?kind=${kind}`,t.tokens.OWNER);
     if (report.status !== 200) throw Error(`Report ${kind} returned ${report.status}: ${JSON.stringify(report.body)}`);
   }

 });
});
