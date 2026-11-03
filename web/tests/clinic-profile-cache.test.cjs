const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function cacheFixture(get) {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/clinicProfileCache.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} }, identity = { version: 0, user: 'user-a', clinic: '' };
  vm.runInNewContext(compiled, { module, exports: module.exports, console,
    sessionStorage: { getItem: () => identity.clinic },
    require: name => name === '../lib/api' ? { get } : { sessionClient: {
      getVersion: () => identity.version, peekSession: () => ({ user: { id: identity.user } }),
    } },
  });
  return { ...module.exports, identity };
}

test('UPI, shop heading and receipt share a single request and reuse the recent profile', async () => {
  let requests = 0;
  const cache = cacheFixture(async () => { requests++; return { data: { data: { name: 'Shop A' } } }; });
  const profiles = await Promise.all([cache.fetchClinicProfile(), cache.fetchClinicProfile(), cache.fetchClinicProfile()]);
  assert.equal(requests, 1);
  assert.equal(profiles[0].name, 'Shop A');
  await cache.fetchClinicProfile();
  assert.equal(requests, 1);
  await cache.fetchClinicProfile(true);
  assert.equal(requests, 2);
});

test('another account, manual session change or impersonated shop never reuses the previous profile', async () => {
  let requests = 0;
  const cache = cacheFixture(async () => ({ data: { data: { request: ++requests } } }));
  await cache.fetchClinicProfile();
  cache.identity.user = 'user-b';
  assert.equal((await cache.fetchClinicProfile()).request, 2);
  cache.identity.version++;
  assert.equal((await cache.fetchClinicProfile()).request, 3);
  cache.identity.clinic = 'shop-b';
  assert.equal((await cache.fetchClinicProfile()).request, 4);
});

test('profile changes discard an older in-flight response instead of restoring stale receipt data', async () => {
  const pending = [];
  const cache = cacheFixture(() => new Promise(resolve => pending.push(resolve)));
  const old = cache.fetchClinicProfile();
  cache.clearClinicProfileCache();
  const current = cache.fetchClinicProfile();
  pending[1]({ data: { data: { name: 'Updated shop' } } });
  await current;
  pending[0]({ data: { data: { name: 'Old shop' } } });
  await old;
  assert.equal((await cache.fetchClinicProfile()).name, 'Updated shop');
});

test('a failed profile request is not cached and can retry', async () => {
  let requests = 0;
  const cache = cacheFixture(async () => {
    if (++requests === 1) throw new Error('Temporary outage');
    return { data: { data: { name: 'Shop A' } } };
  });
  await assert.rejects(cache.fetchClinicProfile());
  assert.equal((await cache.fetchClinicProfile()).name, 'Shop A');
  assert.equal(requests, 2);
});
