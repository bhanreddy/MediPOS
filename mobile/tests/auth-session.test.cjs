const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const axios = require('axios');
const { EventEmitter } = require('node:events');
function load(file, mocks) {
  const compiled = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    console,
    process: { env: {} },
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return module.exports;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function harness(initial = []) {
  const disk = new Map(initial);
  const native = {
    getItemAsync: async (key) => disk.get(key) ?? null,
    setItemAsync: async (key, value) => {
      disk.set(key, value);
    },
    deleteItemAsync: async (key) => {
      disk.delete(key);
    },
  };
  const storage = load('lib/secureStorage.ts', {
    'expo-secure-store': native,
  }).SecureStorage;
  const emitter = new EventEmitter();
  const network = {
    post: async () => ({
      data: { data: { accessToken: 'new', refreshToken: 'rotated' } },
    }),
  };
  const refresh = load('lib/sessionRefresh.ts', {
    axios: network,
    './secureStorage': { SecureStorage: storage },
    './authEventEmitter': { authEventEmitter: emitter },
  }).refreshAccessToken;
  return { disk, native, storage, emitter, network, refresh };
}
test('the access/refresh pair persists atomically across application restarts', async () => {
  const h = harness();
  await h.storage.saveTokens('access', 'refresh');
  assert.equal(h.disk.size, 1);
  const restarted = load('lib/secureStorage.ts', {
    'expo-secure-store': h.native,
  }).SecureStorage;
  assert.equal(await restarted.getAccessToken(), 'access');
  assert.equal(await restarted.getRefreshToken(), 'refresh');
});
test('previous installations keep their saved login through legacy key migration', async () => {
  const h = harness([
    ['med_pos_access_token', 'old'],
    ['med_pos_refresh_token', 'old-refresh'],
  ]);
  assert.equal(await h.storage.getAccessToken(), 'old');
  await h.refresh('http://api', 'old');
  assert.equal(
    JSON.parse(h.disk.get('med_pos_session_v2')).refreshToken,
    'rotated',
  );
});
test('secure storage read failures reject instead of returning a signed-out state', async () => {
  const h = harness();
  h.native.getItemAsync = async () => {
    throw new Error('Keychain locked');
  };
  await assert.rejects(h.storage.getAccessToken(), /Keychain locked/);
});
test('concurrent 401s share one refresh and delayed old-token failures use the renewed token', async () => {
  const h = harness();
  await h.storage.saveTokens('old', 'refresh');
  let calls = 0,
    events = 0;
  const gate = deferred();
  h.emitter.on('TOKEN_REFRESHED', () => events++);
  h.network.post = async () => {
    calls++;
    await gate.promise;
    return { data: { data: { accessToken: 'new', refreshToken: 'rotated' } } };
  };
  const requests = Array.from({ length: 20 }, () =>
    h.refresh('http://api', 'old'),
  );
  await flush();
  gate.resolve();
  assert.ok((await Promise.all(requests)).every((value) => value === 'new'));
  assert.equal(calls, 1);
  assert.equal(events, 1);
  assert.equal(await h.refresh('http://api', 'old'), 'new');
  assert.equal(calls, 1);
  assert.equal(await h.storage.getRefreshToken(), 'rotated');
});
for (const message of ['Offline', '503 unavailable', '401 invalid refresh']) {
  test(`${message}: every waiting request settles and saved credentials remain`, async () => {
    const h = harness();
    await h.storage.saveTokens('old', 'refresh');
    let calls = 0,
      logout = 0;
    h.emitter.on('LOGOUT', () => logout++);
    h.network.post = async () => {
      calls++;
      throw new Error(message);
    };
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => h.refresh('http://api', 'old')),
    );
    assert.ok(results.every((value) => value.status === 'rejected'));
    assert.equal(calls, 1);
    assert.equal(logout, 0);
    assert.equal(await h.storage.getAccessToken(), 'old');
    assert.equal(await h.storage.getRefreshToken(), 'refresh');
  });
}
test('manual logout during network refresh cannot resurrect credentials', async () => {
  const h = harness();
  await h.storage.saveTokens('old', 'refresh');
  const gate = deferred();
  let events = 0;
  h.emitter.on('TOKEN_REFRESHED', () => events++);
  h.network.post = async () => {
    await gate.promise;
    return { data: { accessToken: 'late', refreshToken: 'late-refresh' } };
  };
  const pending = assert.rejects(
    h.refresh('http://api', 'old'),
    /Session changed/,
  );
  await flush();
  await h.storage.clearAll();
  gate.resolve();
  await pending;
  assert.equal(await h.storage.getAccessToken(), null);
  assert.equal(h.disk.size, 0);
  assert.equal(events, 0);
});
test('manual logout during secure write clears the late pair before restart', async () => {
  const h = harness();
  await h.storage.saveTokens('old', 'refresh');
  const gate = deferred();
  h.native.setItemAsync = async (key, value) => {
    await gate.promise;
    h.disk.set(key, value);
  };
  const pending = h.storage.updateTokensIfCurrent(
    'new',
    'rotated',
    h.storage.getRevision(),
  );
  await flush();
  const signout = h.storage.clearAll();
  gate.resolve();
  assert.equal(await pending, false);
  await signout;
  assert.equal(h.disk.size, 0);
  assert.equal(await h.storage.getAccessToken(), null);
});
test('mobile API retries a protected request once and never loops on a second 401', async () => {
  const h = harness();
  await h.storage.saveTokens('old', 'refresh');
  let rotations = 0,
    calls = 0;
  const refreshAccessToken = async (...args) => {
    rotations++;
    return h.refresh(...args);
  };
  const { apiClient } = load('api/client.ts', {
    axios,
    'axios-retry': {
      __esModule: true,
      default: () => {},
      exponentialDelay: () => 0,
      isNetworkError: () => false,
    },
    'react-native': { Platform: { OS: 'ios' } },
    '@/lib/secureStorage': { SecureStorage: h.storage },
    '@/lib/sessionRefresh': { refreshAccessToken },
  });
  apiClient.defaults.adapter = async (config) => {
    calls++;
    throw new axios.AxiosError(
      'Unauthorized',
      'ERR_BAD_REQUEST',
      config,
      {},
      { status: 401, data: {}, headers: {}, config },
    );
  };
  await assert.rejects(apiClient.get('/auth/me'));
  assert.equal(rotations, 1);
  assert.equal(calls, 2);
  assert.equal(await h.storage.getAccessToken(), 'new');
});
function authStoreHarness(h) {
  return load('stores/authStore.ts', {
    zustand: require('zustand'),
    '@/lib/secureStorage': { SecureStorage: h.storage },
    '@/lib/authEventEmitter': { authEventEmitter: h.emitter },
    '@/utils/storage': { store: {} },
  }).useAuthStore;
}
test('a saved token survives startup even if the optional cached user profile is missing', async () => {
  const h = harness();
  await h.storage.saveTokens('old', 'refresh');
  const store = authStoreHarness(h);
  assert.equal(await store.getState().hydrateAuthFromSecureStorage(), true);
  assert.equal(store.getState().token, 'old');
  assert.equal(store.getState().isAuthenticated, true);
  h.emitter.emit('TOKEN_REFRESHED', 'new');
  assert.equal(store.getState().token, 'new');
});
test('native storage failure shows a retry state without clearing the login', async () => {
  const h = harness();
  h.native.getItemAsync = async () => {
    throw new Error('Keychain locked');
  };
  const store = authStoreHarness(h);
  await store.getState().hydrateAuthFromSecureStorage();
  assert.equal(store.getState().restoreError, true);
  assert.equal(h.disk.size, 0);
});
test('a late hydration read cannot undo manual logout', async () => {
  const h = harness([
    [
      'med_pos_session_v2',
      JSON.stringify({ accessToken: 'old', refreshToken: 'refresh' }),
    ],
  ]);
  const gate = deferred();
  h.native.getItemAsync = async (key) => {
    const saved = h.disk.get(key) ?? null;
    await gate.promise;
    return saved;
  };
  const store = authStoreHarness(h);
  const pending = store.getState().hydrateAuthFromSecureStorage();
  await flush();
  store.getState().logout();
  gate.resolve();
  await pending;
  assert.equal(store.getState().token, null);
  assert.equal(store.getState().isAuthenticated, false);
  h.emitter.emit('TOKEN_REFRESHED', 'late');
  assert.equal(store.getState().token, null);
});

test('unchecked Remember me keeps native login and refreshed tokens in memory without saving credentials', async () => {
  const h = harness([['med_pos_session_v2', JSON.stringify({ accessToken: 'old', refreshToken: 'old-refresh' })], ['med_pos_user', JSON.stringify({ id: 'old' })]]);
  await h.storage.setSessionPersistence(false);
  await h.storage.saveTokens('access', 'refresh');
  await h.storage.saveUser({ id: 'operator' });
  assert.equal(await h.storage.getAccessToken(), 'access');
  assert.equal((await h.storage.getUser()).id, 'operator');
  assert.equal(h.disk.size, 0);
  await h.refresh('http://api', 'access');
  assert.equal(await h.storage.getAccessToken(), 'new');
  assert.equal(h.disk.size, 0);
  const restarted = load('lib/secureStorage.ts', { 'expo-secure-store': h.native }).SecureStorage;
  assert.equal(await restarted.getAccessToken(), null);
  assert.equal(await restarted.getUser(), null);
});

test('checked Remember me persists a new native login after a memory-only session', async () => {
  const h = harness();
  await h.storage.setSessionPersistence(false);
  await h.storage.saveTokens('temporary', 'temporary-refresh');
  await h.storage.setSessionPersistence(true);
  await h.storage.saveTokens('remembered', 'remembered-refresh');
  await h.storage.saveUser({ id: 'remembered-operator' });
  const restarted = load('lib/secureStorage.ts', { 'expo-secure-store': h.native }).SecureStorage;
  assert.equal(await restarted.getAccessToken(), 'remembered');
  assert.equal((await restarted.getUser()).id, 'remembered-operator');
});

test('explicit logout clears a memory-only native session', async () => {
  const h = harness();
  await h.storage.setSessionPersistence(false);
  await h.storage.saveTokens('temporary', 'refresh');
  await h.storage.saveUser({ id: 'operator' });
  await h.storage.clearAll();
  assert.equal(await h.storage.getAccessToken(), null);
  assert.equal(await h.storage.getUser(), null);
  assert.equal(h.disk.size, 0);
});
