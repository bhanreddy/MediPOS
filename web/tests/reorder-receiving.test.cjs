const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const invoiceCore = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/invoiceImportCore.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { module: invoiceCore, exports: invoiceCore.exports });

function harness(post) {
  let cursor = 0, counter = 0;
  const slots = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn) { return fn; }, useEffect() {},
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/hooks/usePurchaseFlow.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, Date, Math, Number, Promise,
    console: { error() {} },
    require: name => {
      if (name === 'react') return react;
      if (name === '../lib/api') return { post };
      if (name === 'uuid') return { v4: () => `request-${++counter}` };
      if (name === '../lib/queryClient') return { queryClient: { invalidateQueries: async () => {} } };
      if (name === '../services/invoiceImportCore') return invoiceCore.exports;
      throw Error(name);
    },
  });
  return orderId => { cursor = 0; return module.exports.usePurchaseFlow(orderId); };
}
function prepare(render, orderId) {
  const hook = render(orderId);
  hook.setVendorId('supplier'); hook.setInvoiceNumber('INV-1');
  hook.addItem({ product: { id: 'medicine', gst_rate: '12' }, batchNumber: 'B1', expiryDate: '2099-12-31', quantity: 2, costPrice: 10, mrp: 20 });
  return render(orderId);
}

test('linked receiving normalizes PostgreSQL decimal GST rates before submitting', async () => {
  let payload;
  const render = harness(async (_url, body) => { payload = body; });
  const hook = prepare(render, 'order');
  assert.equal(hook.items[0].total, 22.4);
  await hook.commitToLedger();
  assert.equal(payload.items[0].gst_rate, 12);
  assert.equal(payload.reorder_order_id, 'order');
  assert.ok(payload.reorder_receipt_id);
  assert.equal(render('order').isDraft, false);
});
test('ambiguous receipt failures reuse a request ID on exact retry', async () => {
  const attempts = [];
  const render = harness(async (_url, body) => { attempts.push(body); if (attempts.length === 1) throw Error('Timed out after commit'); });
  await prepare(render, 'order').commitToLedger();
  assert.equal(render('order').isDraft, true);
  await render('order').commitToLedger();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].reorder_receipt_id, attempts[1].reorder_receipt_id);
});
test('ordinary purchase entry keeps its existing unlinked request contract', async () => {
  let payload;
  const render = harness(async (_url, body) => { payload = body; });
  await prepare(render).commitToLedger();
  assert.equal(payload.reorder_order_id, undefined);
  assert.equal(payload.reorder_receipt_id, undefined);
  assert.equal(payload.items[0].gst_rate, 12);
});
test('invoice drafts preserve explicit free stock, tax, discount and request identity across an uncertain retry', async () => {
  const attempts = [];
  const render = harness(async (_url, body) => { attempts.push(body); if (attempts.length === 1) throw Error('Uncertain receipt response'); });
  let hook = render();
  hook.setVendorId('supplier'); hook.setInvoiceNumber('INV-IMPORT');
  hook.loadInvoiceDraft({ filename: 'invoice.xlsx', sha256: 'a'.repeat(64), format: 'xlsx' }, [{
    product: { id: 'medicine', gst_rate: 5 }, batchNumber: '0001', expiryDate: '2099-02-28',
    quantity: 10, freeQuantity: 2, costPrice: 10, mrp: 20, gstRate: 12, discount: 10,
  }]);
  hook = render(); assert.equal(hook.items[0].total, 100.8);
  await hook.commitToLedger(); await render().commitToLedger();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].invoice_import.request_id, attempts[1].invoice_import.request_id);
  assert.equal(attempts[0].invoice_import.source_format, 'xlsx');
  assert.equal(attempts[0].items[0].free_quantity, 2);
  assert.equal(attempts[0].items[0].gst_rate, 12);
  assert.equal(attempts[0].items[0].discount, 10);
});
