// Explicit, non-destructive checkpoint staging. This tool never overwrites a
// canonical business row. It does not load .env or print database credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{gunzipSync}=require('node:zlib');
const postgres=require('postgres'),Database=require('better-sqlite3');
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const target=process.env.MIGRATION_DATABASE_URL;
if(!target)throw new Error('Set MIGRATION_DATABASE_URL explicitly; no environment files are loaded.');
const name=option('--name');if(!name)throw new Error('Specify --name CHECKPOINT. Default mode is a read-only report.');
const sql=postgres(target,{max:1,fetch_types:false,onnotice:()=>{}}),write=args.includes('--stage'),finalize=args.includes('--finalize');
const reviewer=option('--reviewer');
(async()=>{
 const [checkpoint]=await sql`SELECT name,revision,image FROM app_runtime_checkpoints WHERE name=${name}`;
 if(!checkpoint)throw new Error('Checkpoint not found');
 const hash=crypto.createHash('sha256').update(checkpoint.image).digest('hex');
 const db=new Database(gunzipSync(checkpoint.image,{maxOutputLength:256*1024*1024}),{readonly:true});
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const rows=[];
 try{for(const {name:table}of tables){const records=db.prepare(`SELECT * FROM "${table.replaceAll('"','""')}"`).all();records.forEach((record,index)=>rows.push({table,key:String(record._local_id||record.id||record.key||index),record}));}}finally{db.close();}
 if(write)await sql.begin(async tx=>{
  await tx`SELECT name FROM app_runtime_checkpoints WHERE name=${name} AND revision=${checkpoint.revision} FOR UPDATE`;
  for(const row of rows)await tx`INSERT INTO runtime_checkpoint_migration_rows(checkpoint_name,checkpoint_revision,table_name,record_key,source_record)
   VALUES(${name},${checkpoint.revision},${row.table},${row.key},${tx.json(row.record)}) ON CONFLICT DO NOTHING`;
 });
 const resolveTable=option('--resolve-table');
 if(resolveTable){
  const key=option('--resolve-key'),disposition=option('--disposition'),reason=option('--reason'),targetId=option('--target-id');
  if(!key||!reviewer||!reason||reason.trim().length<3||!['IMPORTED','KEEP_CLOUD','ARCHIVED_METADATA'].includes(disposition))throw new Error('Resolution requires a staged row, reviewer, disposition, and reason');
  if(disposition!=='ARCHIVED_METADATA'&&!targetId)throw new Error('Supply --target-id for the verified canonical record');
  const changed=await sql`UPDATE runtime_checkpoint_migration_rows SET disposition=${disposition},target_id=${targetId||null},reviewed_by=${reviewer},reason=${reason},reviewed_at=now()
    WHERE checkpoint_name=${name} AND checkpoint_revision=${checkpoint.revision} AND table_name=${resolveTable} AND record_key=${key} RETURNING record_key`;
  if(!changed.length)throw new Error('Stage this row before resolving it');
 }
 if(finalize){
  if(!reviewer)throw new Error('--reviewer is required for an explicit cutover receipt');
  await sql.begin(async tx=>{
   const [current]=await tx`SELECT revision,image FROM app_runtime_checkpoints WHERE name=${name} FOR UPDATE`;
   if(String(current.revision)!==String(checkpoint.revision)||crypto.createHash('sha256').update(current.image).digest('hex')!==hash)throw new Error('Checkpoint changed; stage and review the new revision');
   const [status]=await tx`SELECT count(*)::int AS total,count(*) FILTER(WHERE disposition='PENDING' OR reviewed_by IS NULL OR reason IS NULL OR length(btrim(reason))<3)::int AS pending FROM runtime_checkpoint_migration_rows WHERE checkpoint_name=${name} AND checkpoint_revision=${checkpoint.revision}`;
   if(status.total!==rows.length||status.pending)throw new Error('Every source row must be staged and explicitly reviewed before cutover');
   // Business rows must point to a preserved canonical record. Metadata can be
   // archived only when it is not a pending offline transaction.
   const decisions=await tx`SELECT * FROM runtime_checkpoint_migration_rows WHERE checkpoint_name=${name} AND checkpoint_revision=${checkpoint.revision}`;
   for(const decision of decisions){
    if(decision.disposition==='ARCHIVED_METADATA'){
     if(!['sync_meta','sync_queue'].includes(decision.table_name)||(decision.table_name==='sync_queue'&&decision.source_record.status!=='done'))throw new Error('Pending transactions cannot be archived as metadata');
     continue;
    }
    const targetTable=decision.table_name==='sync_queue'?decision.source_record.table_name:decision.table_name;
    if(!/^[a-z_][a-z0-9_]*$/.test(targetTable)||!decision.target_id)throw new Error('A canonical target record is required for every business decision');
    const [exists]=await tx.unsafe(`SELECT 1 FROM "${targetTable}" AS target WHERE to_jsonb(target)->>'id'=$1 OR to_jsonb(target)->>'_local_id'=$1 LIMIT 1`,[decision.target_id]);
    if(!exists)throw new Error('A reviewed business record has no canonical target');
   }
   await tx`INSERT INTO runtime_checkpoint_cutovers(checkpoint_name,checkpoint_revision,image_sha256,staged_rows,reviewed_by)
    VALUES(${name},${checkpoint.revision},${hash},${rows.length},${reviewer}) ON CONFLICT(checkpoint_name) DO UPDATE SET checkpoint_revision=excluded.checkpoint_revision,image_sha256=excluded.image_sha256,staged_rows=excluded.staged_rows,reviewed_by=excluded.reviewed_by,created_at=now()`;
  });
 }
 const report={checkpoint:name,revision:String(checkpoint.revision),sha256:hash,sourceRows:rows.length,tables:tables.map(table=>({name:table.name,rows:rows.filter(row=>row.table===table.name).length})),mode:finalize?'FINALIZED':resolveTable?'REVIEWED':write?'STAGED':'READ_ONLY',note:'Canonical business data and the source image have not been overwritten. Pending transactions require explicit reconciliation.'};
 const reportPath=option('--report');if(reportPath)fs.writeFileSync(path.resolve(reportPath),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>sql.end());
