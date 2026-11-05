const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

function loadStore(savedDraft) {
  const storage = new Map();
  if (savedDraft) storage.set('pos-v2-cart-storage', JSON.stringify(savedDraft));
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/store/posStore.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module, exports: module.exports, require, crypto,
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  });
  return module.exports.usePosStore;
}

test('coin redemption is opt-in and switching it off clears the selected amount', () => {
  const store = loadStore();
  assert.equal(store.getState().use_nex_coins, false);
  store.getState().setUseNexCoins(true, 2000);
  assert.equal(store.getState().use_nex_coins, true);
  assert.equal(store.getState().wallet_amount_paise, 2000);
  store.getState().setWalletAmount(1250);
  store.getState().setUseNexCoins(false);
  assert.equal(store.getState().use_nex_coins, false);
  assert.equal(store.getState().wallet_amount_paise, 0);
});

test('clearing the amount while editing keeps the coin choice enabled', () => {
  const store = loadStore();
  store.getState().setUseNexCoins(true, 2000);
  store.getState().setWalletAmount(0);
  assert.equal(store.getState().use_nex_coins, true);
  store.getState().setWalletAmount(1250);
  assert.equal(store.getState().wallet_amount_paise, 1250);
});

test('changing customer or choosing credit resets redemption; updating the same customer preserves it', () => {
  const store = loadStore();
  store.getState().setCustomer('first', 'First', '9000000000');
  store.getState().setUseNexCoins(true, 2000);
  store.getState().setCustomer('first', 'First updated', '9000000000');
  assert.equal(store.getState().use_nex_coins, true);
  store.getState().setCustomer('second', 'Second', '9111111111');
  assert.equal(store.getState().use_nex_coins, false);
  assert.equal(store.getState().wallet_amount_paise, 0);
  store.getState().setUseNexCoins(true, 1000);
  store.getState().setPaymentMode('credit');
  store.getState().setPaymentMode('cash');
  assert.equal(store.getState().use_nex_coins, false);
  assert.equal(store.getState().wallet_amount_paise, 0);
});

test('cleared and completed bills start with coins off', () => {
  for (const action of ['clearCart', 'reset']) {
    const store = loadStore();
    store.getState().setUseNexCoins(true, 2000);
    store.getState()[action]();
    assert.equal(store.getState().use_nex_coins, false);
    assert.equal(store.getState().wallet_amount_paise, 0);
  }
});

test('saved drafts preserve the explicit choice and migrate earlier selected redemptions', () => {
  const legacy = loadStore({ version: 0, state: { customer_id: 'first', wallet_amount_paise: 1250 } });
  assert.equal(legacy.getState().use_nex_coins, true);
  assert.equal(legacy.getState().wallet_amount_paise, 1250);
  const current = loadStore({ version: 1, state: { customer_id: 'first', wallet_amount_paise: 0, use_nex_coins: false } });
  assert.equal(current.getState().use_nex_coins, false);
});

test('old drafts discard retired loyalty credits and tenders while keeping Nex Coins', () => {
  const store = loadStore({ version: 1, state: {
    customer_id: 'first', wallet_amount_paise: 1250, use_nex_coins: true,
    redeem_loyalty_credits: 200,
    payments: [{ tender_type: 'LOYALTY', amount: 50 }, { tender_type: 'CASH', amount: 100 }],
  } });
  assert.equal(Object.hasOwn(store.getState(), 'redeem_loyalty_credits'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(store.getState().payments)), [{ tender_type: 'CASH', amount: 100 }]);
  assert.equal(store.getState().use_nex_coins, true);
  assert.equal(store.getState().wallet_amount_paise, 1250);
});
