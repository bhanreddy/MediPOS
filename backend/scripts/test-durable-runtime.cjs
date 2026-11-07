// Verify real PostgreSQL transactions and private document durability on localhost.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const target=new URL(process.env.TEST_DATABASE_URL||'http://missing.invalid');
if(!['localhost','127.0.0.1'].includes(target.hostname)||!target.pathname.endsWith('_qa'))throw new Error('Set TEST_DATABASE_URL to a disposable localhost *_qa database.');
Object.assign(process.env,{DATABASE_URL:target.href,NODE_ENV:'test',LOCAL_DB_PATH:'/dev/null/cloud-must-not-open-sqlite'});
const {withDurableRuntime}=require('../dist/lib/durableRuntime');
const {postgresQuery,beforePostgresCommit}=require('../dist/lib/postgresDb');
const {PrescriptionStorageService:files}=require('../dist/services/prescription/prescriptionStorageService');
const sql=require('../dist/db').default;
(async()=>{
 const a=randomUUID(),b=randomUUID(),key=`prescriptions/qa/2026/${randomUUID()}.pdf`;
 await sql.unsafe('CREATE TABLE IF NOT EXISTS runtime_durability_qa(id uuid PRIMARY KEY, count integer NOT NULL)');
 await sql`INSERT INTO runtime_durability_qa VALUES(${a},0),(${b},0)`;
 const imageState=await sql`SELECT name,revision,encode(sha256(image),'hex') AS hash FROM app_runtime_checkpoints ORDER BY name`;
 let release,locked;
 const latch=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{locked=resolve;});
 const first=withDurableRuntime(async()=>{await postgresQuery('UPDATE runtime_durability_qa SET count=count+1 WHERE id=$1',[a]);locked();await latch;});
 try {
  await started;
  const independent=withDurableRuntime(()=>postgresQuery('UPDATE runtime_durability_qa SET count=count+1 WHERE id=$1 RETURNING count',[b]));
  let timer;try{const result=await Promise.race([independent,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Independent tenant transaction was serialized')),1500);})]);assert.equal(result[0].count,1);}finally{clearTimeout(timer);release();}
  await first;
  await assert.rejects(withDurableRuntime(async()=>{
   await postgresQuery('UPDATE runtime_durability_qa SET count=999 WHERE id=$1',[a]);
   await files.save(key,Buffer.from('%PDF-1.4 QA'));
   beforePostgresCommit(()=>{throw new Error('simulated persistence failure');});
  }),/simulated persistence failure/);
  assert.equal((await sql`SELECT count FROM runtime_durability_qa WHERE id=${a}`)[0].count,1);
  await assert.rejects(files.read(key),/unavailable/);
  await withDurableRuntime(()=>files.save(key,Buffer.from('%PDF-1.4 QA')));
  assert.equal((await files.read(key)).toString(),'%PDF-1.4 QA');
  assert.deepEqual(await sql`SELECT name,revision,encode(sha256(image),'hex') AS hash FROM app_runtime_checkpoints ORDER BY name`,imageState);
  console.log('PASS: independent cloud transactions, SQL/document rollback, document persistence, unchanged legacy checkpoints.');
 }finally{release();await first.catch(()=>{});await sql`DELETE FROM runtime_durability_qa WHERE id IN(${a},${b})`;await files.remove(key);}
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>sql.end());
