const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(verify) {
  const storage = new Map(); let opened = 0;
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/completePhonePeReturn.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports, Error,
    window: { location: { pathname: '/payment-return', search: '' } },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) },
    require(name) {
      if (name === './cloudAuthService') return { CloudAuthService: { onPaymentVerified: async () => { opened++; } } };
      if (name === './subscriptionApi') return { verifySubscriptionPayment: verify };
      return { matchesUserSubscriptionReturnPath: path => path === '/payment-return', PHONEPE_SESSION_PENDING_USER: 'pending', PHONEPE_SESSION_PAYMENT_ERROR: 'error', readMerchantOrderIdFromSearchParams: () => null };
    },
  });
  return { storage, service: module.exports, opened: () => opened };
}
test('duplicate payment-return mounts share one server verification', async () => {
  let calls = 0;
  const env = load(async () => { calls++; return { plan: 'monthly', expires_at: null }; });
  env.storage.set('pending', 'order');
  await Promise.all([env.service.tryCompletePhonePeReturn(), env.service.tryCompletePhonePeReturn()]);
  assert.equal(calls, 1); assert.equal(env.opened(), 1); assert.equal(env.storage.has('pending'), false);
});
test('failed payment confirmation keeps the pending order available for retry', async () => {
  let calls = 0;
  const env = load(async () => { if (++calls === 1) throw new Error('Temporary outage'); return { plan: 'monthly', expires_at: null }; });
  env.storage.set('pending', 'order');
  await assert.rejects(env.service.tryCompletePhonePeReturn());
  assert.equal(env.storage.get('pending'), 'order'); assert.equal(env.storage.get('error'), 'Temporary outage');
  await env.service.tryCompletePhonePeReturn(); assert.equal(calls,2); assert.equal(env.storage.has('error'), false);
});
test('visiting payment-return without an order never calls the gateway', async () => {
  const env = load(async () => { throw new Error('Unexpected payment call'); });
  await env.service.tryCompletePhonePeReturn(); assert.equal(env.opened(),0);
});
