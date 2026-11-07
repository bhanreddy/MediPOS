const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { module, exports: module.exports, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } });
  return module.exports;
}

const { buildCreateSalePayload } = load('api/sales.ts', { './client': {} });
const body = {
  discount: 0, payment_mode: 'cash', payment_status: 'paid', paid_amount: 0,
  items: [{ medicine_id: 'medicine', batch_id: 'batch', quantity: 1, mrp: 112, discount_pct: 0, gst_rate: 12 }],
};

test('mobile collects the displayed price for every GST slab', () => {
  for (const rate of [0, 5, 12, 18, 28]) {
    const payload = buildCreateSalePayload({ ...body, items: [{ ...body.items[0], gst_rate: rate }] });
    assert.equal(payload.price_includes_tax, true);
    assert.equal(payload.paid_amount, 112);
    assert.equal(payload.items[0].gst_rate, rate);
  }
});

test('mobile discounts and credit payments never add GST', () => {
  const discounted = { ...body, discount: 11.6, items: [{ ...body.items[0], quantity: 2, discount_pct: 10 }] };
  assert.equal(buildCreateSalePayload(discounted).paid_amount, 190);
  assert.equal(buildCreateSalePayload({ ...discounted, payment_mode: 'credit' }).paid_amount, 0);
  assert.equal(buildCreateSalePayload({ ...discounted, payment_status: 'partial', paid_amount: 50 }).paid_amount, 50);
  assert.equal(buildCreateSalePayload({ ...body, discount: 200 }).paid_amount, 0);
});

test('cart GST is a portion of the discounted total', () => {
  const { useCartStore: cart } = load('stores/cartStore.ts', {
    zustand: { create: initialize => {
      let state;
      state = initialize(update => {
        state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
      }, () => state);
      return { getState: () => state };
    } },
  });
  cart.getState().addItem({ product: { id: 'medicine' }, batchId: 'batch', qty: 1, mrp: 112, discountPct: 10, gstRate: 12, maxQty: 5 });
  cart.getState().setDiscount(10);
  assert.equal(cart.getState().getTotal(), 90.72);
  assert.ok(Math.abs(cart.getState().getGstTotal() - 9.72) < 0.00001);
});
