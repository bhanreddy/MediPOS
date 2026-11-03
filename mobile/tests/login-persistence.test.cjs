const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function storage(disk = new Map()) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/secureStorage.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const secureStore = {
    getItemAsync: async key => disk.get(key) ?? null,
    setItemAsync: async (key, value) => { disk.set(key, value); },
    deleteItemAsync: async key => { disk.delete(key); },
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    assert.equal(name, 'expo-secure-store');
    return secureStore;
  } });
  return { api: module.exports.SecureStorage, disk };
}

test('unchecked Remember me keeps tokens and profile only for this app process', async () => {
  const { api, disk } = storage();
  await api.setSessionPersistence(false);
  await api.saveTokens('access', 'refresh');
  await api.saveUser({ name: 'Operator' });
  assert.equal(await api.getAccessToken(), 'access');
  assert.equal(await api.getRefreshToken(), 'refresh');
  assert.equal((await api.getUser()).name, 'Operator');
  assert.equal(disk.size, 0);
  assert.equal(await storage(disk).api.getAccessToken(), null);
  await api.clearAll();
  assert.equal(await api.getAccessToken(), null);
  assert.equal(await api.getUser(), null);
});

test('checked Remember me restores tokens and profile after a restart', async () => {
  const { api, disk } = storage();
  await api.setSessionPersistence(true);
  await api.saveTokens('access', 'refresh');
  await api.saveUser({ name: 'Operator' });
  const restored = storage(disk).api;
  assert.equal(await restored.getAccessToken(), 'access');
  assert.equal(await restored.getRefreshToken(), 'refresh');
  assert.equal((await restored.getUser()).name, 'Operator');
});

test('switching Remember me off removes the previous persisted session', async () => {
  const { api, disk } = storage();
  await api.saveTokens('old-access', 'old-refresh');
  await api.saveUser({ name: 'Previous operator' });
  await api.setSessionPersistence(false);
  assert.equal(disk.size, 0);
  assert.equal(await api.getAccessToken(), null);
  assert.equal(await api.getUser(), null);
});
