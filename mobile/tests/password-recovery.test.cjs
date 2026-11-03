const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function harness() {
  const calls = [];
  const auth = {
    resetPasswordForEmail: async (...args) => { calls.push(['recover', ...args]); return { error: null }; },
    setSession: async (...args) => { calls.push(['session', ...args]); return { error: null }; },
    updateUser: async (...args) => { calls.push(['update', ...args]); return { error: null }; },
    signOut: async (...args) => { calls.push(['signout', ...args]); return { error: null }; },
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/passwordRecovery.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, URLSearchParams, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } }, require: name => {
    if (name === 'react-native-url-polyfill/auto') return {};
    if (name === '@supabase/supabase-js') return { createClient: (url, key, options) => { calls.push(['client', options]); return { auth }; } };
    if (name === 'expo-linking') return { createURL: route => `medical-pos://${route.slice(1)}` };
    throw new Error(name);
  } });
  return { ...module.exports, calls, auth };
}
test('native recovery emails link back into the app without persisting recovery credentials', async () => {
  const h = harness();
  await h.sendPasswordReset('operator@example.invalid');
  assert.equal(h.calls[0][1].auth.persistSession, false);
  assert.equal(h.calls[1][1], 'operator@example.invalid');
  assert.equal(h.calls[1][2].redirectTo, 'medical-pos://reset-password');
});
test('native password recovery validates deep links before accepting a session', async () => {
  const h = harness();
  await assert.rejects(h.openPasswordResetLink('medical-pos://reset-password'), /invalid or expired/);
  assert.equal(h.calls.length, 0);
  await h.openPasswordResetLink('medical-pos://reset-password#access_token=reset-access&refresh_token=reset-refresh');
  assert.equal(h.calls[1][1].access_token, 'reset-access');
  assert.equal(h.calls[1][1].refresh_token, 'reset-refresh');
});
test('password changes release only the temporary recovery session', async () => {
  const h = harness();
  await h.updateRecoveredPassword('a-new-password');
  assert.equal(h.calls[1][0], 'update');
  assert.equal(h.calls[1][1].password, 'a-new-password');
  assert.equal(h.calls[2][1].scope, 'local');
});
test('recovery errors stay visible and a failed password update does not sign out', async () => {
  const h = harness();
  h.auth.updateUser = async () => ({ error: new Error('Password rejected') });
  await assert.rejects(h.updateRecoveredPassword('bad'), /Password rejected/);
  assert.equal(h.calls.some(call => call[0] === 'signout'), false);
});
