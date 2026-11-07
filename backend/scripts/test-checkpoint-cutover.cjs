const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const url = new URL(process.env.TEST_DATABASE_URL || 'http://missing.invalid');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_qa')) {
  throw new Error('Use a disposable localhost *_qa database with all migrations applied');
}
Object.assign(process.env, { NODE_ENV:'test', DATABASE_URL:url.href, MIGRATION_DATABASE_URL:url.href });
const sql = require('../dist/db').default;
const { verifyCheckpointCutover } = require('../dist/services/checkpointCutover');
const name = `synthetic-checkpoint-${randomUUID()}`;
const clinic = randomUUID(), customer = randomUUID();
const tool = (...args) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'stage-runtime-checkpoint.cjs'), '--name', name, ...args], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));

(async () => {
  await verifyCheckpointCutover();
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE customers(id text, clinic_id text, name text); CREATE TABLE sync_meta(key text, value text)');
  sqlite.prepare('INSERT INTO customers VALUES (?,?,?)').run(customer, clinic, 'Synthetic QA Customer');
  sqlite.prepare('INSERT INTO sync_meta VALUES (?,?)').run('cursor', 'fixture');
  const original = gzipSync(sqlite.serialize());
  sqlite.close();
  await sql`INSERT INTO clinics(id,_local_id,name,slug) VALUES(${clinic},${clinic},'Cutover QA',${clinic})`;
  await sql`INSERT INTO customers(id,_local_id,clinic_id,name) VALUES(${customer},${customer},${clinic},'Synthetic QA Customer')`;
  await sql`INSERT INTO app_runtime_checkpoints(name,revision,image) VALUES(${name},42,${original})`;
  await assert.rejects(verifyCheckpointCutover(), /explicit reconciliation/);
  assert.equal(tool().mode, 'READ_ONLY');
  assert.equal((await sql`SELECT * FROM runtime_checkpoint_migration_rows WHERE checkpoint_name=${name}`).length, 0);
  assert.equal(tool('--stage').sourceRows, 2);
  assert.throws(() => tool('--finalize','--reviewer','Local QA'), /explicitly reviewed/);
  tool('--resolve-table','customers','--resolve-key',customer,'--disposition','KEEP_CLOUD','--target-id',customer,'--reason','Verified against QA customer','--reviewer','Local QA');
  tool('--resolve-table','sync_meta','--resolve-key','cursor','--disposition','ARCHIVED_METADATA','--reason','Fixture cursor only','--reviewer','Local QA');
  assert.equal(tool('--finalize','--reviewer','Local QA').mode, 'FINALIZED');
  await verifyCheckpointCutover();
  assert.deepEqual((await sql`SELECT image FROM app_runtime_checkpoints WHERE name=${name}`)[0].image, original);
  await sql`UPDATE app_runtime_checkpoints SET revision=43 WHERE name=${name}`;
  await assert.rejects(verifyCheckpointCutover(), /explicit reconciliation/);
  console.log('PASS: read-only inventory, explicit staging and canonical review, source preserved, stale receipt rejected.');
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(async () => {
  await sql`DELETE FROM runtime_checkpoint_migration_rows WHERE checkpoint_name=${name}`;
  await sql`DELETE FROM runtime_checkpoint_cutovers WHERE checkpoint_name=${name}`;
  await sql`DELETE FROM app_runtime_checkpoints WHERE name=${name}`;
  await sql`DELETE FROM customers WHERE id=${customer}`;
  await sql`DELETE FROM clinics WHERE id=${clinic}`;
  await sql.end();
});
