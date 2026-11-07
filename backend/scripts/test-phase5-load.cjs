const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const postgres = require('postgres');

const api = new URL(process.env.QA_API_URL || 'http://127.0.0.1:55605');
const database = new URL(process.env.TEST_DATABASE_URL || 'http://missing.invalid');
if ([api,database].some(url => !['localhost','127.0.0.1'].includes(url.hostname)) ||
    !database.pathname.endsWith('_qa') || !['http:','https:'].includes(api.protocol)) {
  throw new Error('Load QA requires a disposable localhost *_qa database and API.');
}
const fixture = JSON.parse(fs.readFileSync(process.env.QA_AUTH_FILE,'utf8'));
const sql = postgres(database.href, { max: 2 });
const branches = [
  { name:'east', id:fixture.store, token:fixture.cashier_token, batch:fixture.batches[0] },
  { name:'west', id:fixture.sister, token:fixture.west_cashier_token, batch:fixture.batches[1] },
];
const endpoint = (path) => new URL(path, api);
async function request(path, branch, payload) {
  const start = performance.now();
  const response = await fetch(endpoint(path), {
    method: payload ? 'POST' : 'GET',
    headers: {
      ...(branch ? { Authorization: `Bearer ${branch.token}`, 'x-store-id':branch.id } : {}),
      ...(payload ? { 'Content-Type':'application/json' } : {}),
    },
    body: payload && JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  return { status:response.status, body:data, ms:performance.now()-start };
}
function summary(samples, elapsed) {
  const times = samples.map(sample=>sample.ms).sort((a,b)=>a-b);
  const percentile = p => +times[Math.ceil(times.length*p)-1].toFixed(1);
  return {
    count:times.length, p50_ms:percentile(.5), p95_ms:percentile(.95),
    max_ms:percentile(1), elapsed_ms:+elapsed.toFixed(1), requests_per_s:+(times.length*1000/elapsed).toFixed(1),
    statuses:Object.fromEntries([...new Set(samples.map(sample=>sample.status))].sort()
      .map(status=>[status,samples.filter(sample=>sample.status===status).length])),
  };
}
function expectStatus(response, expected) {
  assert.equal(response.status, expected, JSON.stringify(response.body));
}
const line = medicine_id => ({ medicine_id, quantity:1, mrp:10, gst_rate:0, allocation_mode:'auto' });

async function reads() {
  const owner = {...branches[0], token:fixture.access_token};
  const today = new Date().toISOString().slice(0,10);
  const paths = [
    ['search', '/api/inventory/medicines/search?q=QA%20Catalogue%202&limit=25&include_substitutes=false', branches[0]],
    ['catalogue', '/api/inventory/medicines', branches[0]],
    ['catalogue_page', '/api/inventory/medicines?page_size=250', branches[0]],
    ['dashboard', '/api/reports/dashboard', branches[0]],
    ['chain', `/api/branches/analytics?from=${today}&to=${today}`, owner],
  ];
  await request('/__qa/metrics');
  const results = {};
  for (const [name,path,branch] of paths) {
    if (process.env.QA_READS && !process.env.QA_READS.split(',').includes(name)) continue;
    expectStatus(await request(path,branch),200);
    const start = performance.now();
    const samples = [];
    for (let round=0; round<4; round++) {
      samples.push(...await Promise.all(Array.from({length:5},()=>request(path,branch))));
    }
    for (const response of samples) {
      expectStatus(response,200);
      if (name==='catalogue_page') {
        assert.equal(response.body.data.length,250);
        assert(response.body.next_cursor);
      }
    }
    results[name] = summary(samples,performance.now()-start);
    console.error(name, JSON.stringify(results[name]));
  }
  if (process.env.QA_VERIFY_CATALOGUE === '1') {
    const all = await request('/api/inventory/medicines',branches[0]);
    expectStatus(all,200);
    const items = [];
    let cursor = '';
    const start = performance.now();
    do {
      const page = await request(`/api/inventory/medicines?page_size=250${cursor ? `&after=${cursor}` : ''}`,branches[0]);
      expectStatus(page,200);
      items.push(...page.body.data);
      assert(!page.body.next_cursor || page.body.next_cursor>cursor);
      cursor = page.body.next_cursor;
    } while (cursor);
    const stock = rows => rows.map(row=>[row.id,row.total_stock,row.medicine_batches.map(batch=>batch.id).sort()]).sort();
    assert.deepEqual(stock(items),stock(all.body.data));
    results.complete_paged_catalogue = { medicines:items.length, elapsed_ms:+(performance.now()-start).toFixed(1) };
  }
  return { ...results, api_metrics:(await request('/__qa/metrics')).body };
}

async function checkout() {
  for (const branch of branches) {
    expectStatus(await request('/api/register/open',branch,{ opening_paise:10000,request_id:randomUUID() }),201);
  }
  const operations = Array.from({length:50},()=>branches.map(branch=>({
    branch,
    payload:{
      _local_id:randomUUID(), register_required:true, items:[line(fixture.med)],
      payments:[{tender_type:'CASH',amount_paise:400},{tender_type:'UPI',amount_paise:600}],
    },
  }))).flat();
  await request('/__qa/metrics');
  const start = performance.now();
  const result = await Promise.all(operations.map(async operation => ({
    ...operation, ...await request('/api/sales',operation.branch,operation.payload),
  })));
  const elapsed = performance.now()-start;
  const runtime = (await request('/__qa/metrics')).body;
  const committed = result.filter(row=>row.status===201);
  assert.equal(committed.length,80,JSON.stringify(result.reduce((counts,row)=>{
    const key = row.body.error?.code || row.status;
    counts[key] = (counts[key] || 0)+1;
    return counts;
  },{})));
  assert.equal(new Set(committed.map(row=>row.body.data.invoice_number)).size,80);
  for (const row of result.filter(row=>row.status!==201)) {
    expectStatus(row,409);
    assert.match(row.body.error.message,/stock|available/i);
  }
  const [east,west] = branches;
  for (const branch of branches) {
    const accepted = committed.filter(row=>row.branch.id===branch.id);
    assert.equal(accepted.length,40);
    const other = branch === east ? west : east;
    expectStatus(await request(`/api/sales/${accepted[0].body.data.id}`,other),403);
    expectStatus(await request('/api/inventory/batches',{...other,id:branch.id}),403);
    const replay = await Promise.all(Array.from({length:5},()=>request('/api/sales',branch,accepted[0].payload)));
    for (const duplicate of replay) {
      expectStatus(duplicate,200);
      assert.equal(duplicate.body.data.id,accepted[0].body.data.id);
    }
    const invoices = await sql`SELECT id,_local_id,invoice_number FROM sales
      WHERE clinic_id=${fixture.clinic} AND store_id=${branch.id}`;
    assert.deepEqual(new Set(invoices.map(row=>row._local_id)),new Set(accepted.map(row=>row.payload._local_id)));
    const [remaining] = await sql`SELECT quantity_remaining FROM medicine_batches WHERE id=${branch.batch}`;
    assert.equal(remaining.quantity_remaining,0);
    const ledger = await sql`SELECT reference_id,batch_id,store_id,quantity_delta,balance_after FROM stock_ledger
      WHERE reference_id IN ${sql(invoices.map(row=>row.id))} ORDER BY balance_after DESC`;
    assert.equal(ledger.length,40);
    assert.equal(new Set(ledger.map(row=>row.reference_id)).size,40);
    assert(ledger.every(row=>row.batch_id===branch.batch && row.store_id===branch.id && row.quantity_delta===-1));
    assert.deepEqual(ledger.map(row=>row.balance_after),Array.from({length:40},(_,index)=>39-index));
    const payments = await sql`SELECT sale_id,tender_type,amount_paise,store_id,register_session_id FROM payment_transactions
      WHERE sale_id IN ${sql(invoices.map(row=>row.id))}`;
    assert.equal(payments.length,80);
    assert(payments.every(row=>row.store_id===branch.id && row.register_session_id));
    for (const invoice of invoices) {
      assert.deepEqual(payments.filter(row=>row.sale_id===invoice.id)
        .map(row=>[row.tender_type,Number(row.amount_paise)]).sort(),[['CASH',400],['UPI',600]]);
    }
  }
  return { ...summary(result,elapsed), committed_per_s:+(80*1000/elapsed).toFixed(1),
    stores:Object.fromEntries(branches.map(branch=>[branch.name,summary(result.filter(row=>row.branch===branch),elapsed)])),
    api_metrics:runtime, replayed:10, denied_cross_store_checks:4 };
}

async function replay(command, receiptId) {
  const start = performance.now();
  const requests = await Promise.all(Array.from({length:10},()=>request('/api/offline/commands',branches[0],command)));
  for (const response of requests) {
    expectStatus(response,200);
    assert.equal(response.body.data.status,'APPLIED');
  }
  const receiptIds = new Set(requests.map(response=>response.body.data.data.id));
  assert.equal(receiptIds.size,1);
  const first = requests.filter(response=>!response.body.data.replayed);
  assert.equal(first.length,receiptId ? 0 : 1);
  const [saleId] = receiptIds;
  if (receiptId) assert.equal(saleId,receiptId);
  const [counts] = await sql`SELECT
    (SELECT count(*)::int FROM sales WHERE id=${saleId}) AS sales,
    (SELECT count(*)::int FROM stock_ledger WHERE reference_id=${saleId}) AS ledger,
    (SELECT count(*)::int FROM payment_transactions WHERE sale_id=${saleId}) AS payments,
    (SELECT count(*)::int FROM offline_command_inbox WHERE clinic_id=${fixture.clinic}
      AND command_id=${command.command_id} AND status='APPLIED') AS commands`;
  assert.deepEqual({...counts},{sales:1,ledger:1,payments:1,commands:1});
  return { saleId, metrics:summary(requests,performance.now()-start) };
}

(async()=>{
  const mode = process.argv[2] || 'all';
  if (mode==='reads') {
    console.log(JSON.stringify(await reads(),null,2));
    return;
  }
  if (mode==='restore') {
    const { command,saleId } = JSON.parse(fs.readFileSync(process.env.QA_REPLAY_FILE,'utf8'));
    console.log(JSON.stringify((await replay(command,saleId)).metrics,null,2));
    return;
  }
  if (mode!=='all' && mode!=='checkout') throw new Error('Use all, reads, checkout, or restore.');
  const readMetrics = mode==='all' ? await reads() : undefined;
  const checkoutMetrics = await checkout();
  const command = {
    command_id:randomUUID(), device_id:'phase5-disaster-recovery', type:'SALE',
    payload:{store_id:fixture.store,paid_amount:10,payment_mode:'upi',items:[line(fixture.offline_med)]},
  };
  const offline = await replay(command);
  fs.writeFileSync(process.env.QA_REPLAY_FILE,JSON.stringify({command,saleId:offline.saleId}),{ mode:0o600, flag:'wx' });
  console.log(JSON.stringify({reads:readMetrics,checkout:checkoutMetrics,offline:offline.metrics},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>sql.end());
