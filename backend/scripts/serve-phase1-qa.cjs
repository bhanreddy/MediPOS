const {randomUUID,randomBytes}=require('node:crypto');const fs=require('node:fs');
// Seed a disposable PostgreSQL database for the real app. Never load .env.
const db = new URL(process.env.TEST_DATABASE_URL || 'http://missing.invalid');
const api = new URL(process.env.QA_API_URL || 'http://127.0.0.1:55601');
const web = new URL(process.env.QA_WEB_URL || 'http://127.0.0.1:4179');
if ([db,api,web].some(url=>!['127.0.0.1','localhost'].includes(url.hostname)) || !db.pathname.endsWith('_qa') || !api.port || !process.env.QA_AUTH_FILE) throw new Error('Set TEST_DATABASE_URL (local *_qa) and QA_AUTH_FILE (outside the repository)');
const qaSecret=process.env.QA_JWT_SECRET || randomBytes(32).toString('hex');
if (qaSecret.length < 32 || process.env.QA_REUSE_FIXTURE === '1' && !process.env.QA_JWT_SECRET) {
 throw new Error('Reusing a QA fixture requires its original signing key.');
}
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:db.href,SUPABASE_URL:api.origin,SUPABASE_SERVICE_ROLE_KEY:'local-qa',SUPABASE_JWT_SECRET:qaSecret,JWT_SECRET:qaSecret,WALLET_LEDGER_SECRET:randomBytes(32).toString('hex'),ALLOWED_ORIGINS:web.origin,LOCAL_DB_PATH:'/dev/null/cloud-must-not-open-sqlite'});
const sql=require('../dist/db').default,jwt=require('jsonwebtoken');
function listen(clinic, organization) {
 const {createApp}=require('../dist/app');
 const express=require('express'), app=express();
 app.get('/rest/v1/clinic_subscriptions',(_req,res)=>res.json({clinic_id:clinic,status:'active',plan_name:'pro',expiry_date:'2099-01-01'}));
 app.get('/rest/v1/clinics',(_req,res)=>res.json({id:clinic,name:'QA Pharmacy',is_active:true,plan:'pro',organization_id:organization}));
 if (process.env.QA_LOAD_TEST === '1') {
  const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  let cpu = process.cpuUsage(), loop = performance.eventLoopUtilization();
  app.get('/__qa/metrics', (_req,res) => {
   res.json({ cpu_us: process.cpuUsage(cpu), memory_bytes: process.memoryUsage(),
    event_loop: performance.eventLoopUtilization(loop), delay_p95_ms: delay.percentile(95)/1e6,
    delay_max_ms: delay.max/1e6 });
   cpu = process.cpuUsage(); loop = performance.eventLoopUtilization(); delay.reset();
  });
 }
 app.use(createApp());
 app.listen(Number(api.port),'127.0.0.1',()=>console.log(`QA API ready on ${api.origin}`));
}
(async()=>{
 if (process.env.QA_REUSE_FIXTURE === '1') {
  const fixture = JSON.parse(fs.readFileSync(process.env.QA_AUTH_FILE, 'utf8'));
  listen(fixture.clinic, fixture.organization);
  return;
 }
 const clinic=randomUUID(),organization=randomUUID(),store=randomUUID(),owner=randomUUID(),cashier=randomUUID(),pharmacist=randomUUID(),med=randomUUID(),a=randomUUID(),b=randomUUID(),supplier=randomUUID();
 await sql`INSERT INTO organizations(id,_local_id,legal_name,display_name,code) VALUES(${organization},${organization},'QA Pharmacy','QA Pharmacy',${organization})`;
 await sql`INSERT INTO clinics(id,_local_id,name,slug,organization_id,plan) VALUES(${clinic},${clinic},'QA Pharmacy',${clinic},${organization},'pro')`;
 await sql`INSERT INTO stores(id,_local_id,organization_id,clinic_id,store_code,name) VALUES(${store},${store},${organization},${clinic},'QA-UI','QA Store')`;
 const tokens={};
 for(const [id,role] of [[owner,'OWNER'],[cashier,'CASHIER'],[pharmacist,'PHARMACIST']]){
  await sql`INSERT INTO auth.users(id) VALUES(${id})`;await sql`INSERT INTO users(id,_local_id,clinic_id,role,email,full_name) VALUES(${id},${id},${clinic},${role},${`${id}@example.invalid`},${`QA ${role}`})`;
  const x=randomUUID(),y=randomUUID();await sql`INSERT INTO user_organization_access(id,_local_id,user_id,organization_id,role) VALUES(${x},${x},${id},${organization},${role})`;
  await sql`INSERT INTO user_store_access(id,_local_id,user_id,organization_id,store_id,role,is_default) VALUES(${y},${y},${id},${organization},${store},${role==='OWNER'?'STORE_MANAGER':role},true)`;
  tokens[role]=jwt.sign({sub:id,clinic_id:clinic,role},process.env.JWT_SECRET,{expiresIn:'1h'});
 }
 await sql`INSERT INTO subscription_plans(name,display_name,limits) VALUES(${clinic},'QA Active',${sql.json({max_daily_bills:9999,max_users:20})})`;
 await sql`INSERT INTO clinic_subscriptions(clinic_id,status,plan_name) VALUES(${clinic},'active',${clinic})`;
 await sql`INSERT INTO suppliers(id,_local_id,clinic_id,organization_id,name) VALUES(${supplier},${supplier},${clinic},${organization},'QA Vendor')`;
 await sql`INSERT INTO medicines(id,_local_id,clinic_id,organization_id,name,gst_rate) VALUES(${med},${med},${clinic},${organization},'QA Browser FEFO',0)`;
 for(const [id,number,qty,mrp,days] of [[a,'QA-EARLY',3,10,90],[b,'QA-LATER',10,12,200]]){
  const expiry=new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  await sql`INSERT INTO medicine_batches(id,_local_id,clinic_id,organization_id,store_id,medicine_id,supplier_id,batch_number,expiry_date,mrp,purchase_price,quantity_in,quantity_remaining) VALUES(${id},${id},${clinic},${organization},${store},${med},${supplier},${number},${expiry},${mrp},5,${qty},${qty})`;
 }
 let sister;
 if(process.env.QA_BRANCHES === '1' || process.env.QA_LOAD_TEST === '1'){
  sister=randomUUID();
  await sql`INSERT INTO stores(id,_local_id,organization_id,clinic_id,store_code,name) VALUES(${sister},${sister},${organization},${clinic},'QA-WEST','QA West Branch')`;
  await sql`UPDATE medicine_batches SET store_id=${sister} WHERE id=${b}`;
  const grant=randomUUID();
  await sql`INSERT INTO user_store_access(id,_local_id,user_id,organization_id,store_id,role)
     VALUES(${grant},${grant},${pharmacist},${organization},${sister},'PHARMACIST')`;
 }
 const fixture={access_token:tokens.OWNER,cashier_token:tokens.CASHIER,pharmacist_token:tokens.PHARMACIST,
  owner,cashier,pharmacist,clinic,store,med,organization,supplier,sister,batches:[a,b]};
 if (process.env.QA_LOAD_TEST === '1') {
  const westCashier=randomUUID(), orgGrant=randomUUID(), storeGrant=randomUUID();
  await sql`INSERT INTO auth.users(id) VALUES(${westCashier})`;
  await sql`INSERT INTO users(id,_local_id,clinic_id,role,email,full_name) VALUES
   (${westCashier},${westCashier},${clinic},'CASHIER',${`${westCashier}@example.invalid`},'QA West Cashier')`;
  await sql`INSERT INTO user_organization_access(id,_local_id,user_id,organization_id,role)
   VALUES(${orgGrant},${orgGrant},${westCashier},${organization},'CASHIER')`;
  await sql`INSERT INTO user_store_access(id,_local_id,user_id,organization_id,store_id,role,is_default)
   VALUES(${storeGrant},${storeGrant},${westCashier},${organization},${sister},'CASHIER',true)`;
  fixture.west_cashier_token=jwt.sign({sub:westCashier,clinic_id:clinic,role:'CASHIER'},qaSecret,{expiresIn:'4h'});
  await sql`UPDATE medicine_batches SET quantity_in=40,quantity_remaining=40,mrp=10 WHERE id IN (${a},${b})`;
  await sql`WITH seed AS (SELECT gen_random_uuid() AS id,n FROM generate_series(1,5000) AS n)
   INSERT INTO medicines(id,_local_id,clinic_id,organization_id,name,generic_name,gst_rate)
   SELECT id,id,${clinic},${organization},'QA Catalogue ' || n,'QA Synthetic',0 FROM seed`;
  await sql`WITH seed AS (
   SELECT gen_random_uuid() AS id,m.id AS medicine_id,location.id AS store_id FROM medicines m
   CROSS JOIN (VALUES (${store}::uuid),(${sister}::uuid)) AS location(id)
   WHERE m.clinic_id=${clinic} AND m.id<>${med}
  ) INSERT INTO medicine_batches(id,_local_id,clinic_id,organization_id,store_id,medicine_id,supplier_id,batch_number,
   expiry_date,mrp,purchase_price,quantity_in,quantity_remaining)
   SELECT id,id,${clinic},${organization},store_id,medicine_id,${supplier},id::text,current_date+180,10,5,10,10 FROM seed`;
  const [offline]=await sql`SELECT id FROM medicines WHERE clinic_id=${clinic} AND name='QA Catalogue 5000'`;
  fixture.offline_med=offline.id;
  await sql`ANALYZE medicines`; await sql`ANALYZE medicine_batches`;
 }
 fs.writeFileSync(process.env.QA_AUTH_FILE,JSON.stringify(fixture),{mode:0o600});
 if(process.env.QA_REGULATED === '1'){
  await sql`UPDATE stores SET address='QA Licensed Pharmacy',drug_licence_number='QA-DL',state_code='36',gstin_override='36ABCDE1234F1Z5' WHERE id=${store}`;
  await sql`UPDATE medicines SET schedule_classification='SCHEDULE_H1',manufacturer='QA Manufacturer',gst_rate=5,hsn_code='300490' WHERE id=${med}`;
 }
 listen(clinic, organization);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
