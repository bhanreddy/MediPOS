const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const axios = require("axios");
function load(file, mocks, globals = {}) {
  const source = fs
    .readFileSync(path.join(__dirname, "../src", file), "utf8")
    .replace("import.meta.env.VITE_API_URL", '""');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    console,
    sessionStorage: (() => {
      const values = new Map();
      return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
      };
    })(),
    ...globals,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return module.exports;
}
const session = (access = "old", refresh = "refresh-old") => ({
  access_token: access,
  refresh_token: refresh,
  user: { id: "operator", email: "operator@example.com", user_metadata: {} },
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness(saved = session()) {
  let callback,
    sdkSession = saved;
  const state = { saved, refreshed: 0, signedOut: 0, removed: [], events: {} };
  const auth = {
    onAuthStateChange: (cb) => {
      callback = cb;
    },
    getSession: async () => ({ data: { session: sdkSession }, error: null }),
    refreshSession: async () => {
      state.refreshed++;
      sdkSession = session("new", "refresh-new");
      callback("TOKEN_REFRESHED", sdkSession);
      return { data: { session: sdkSession }, error: null };
    },
    signOut: async (options) => {
      assert.equal(options.scope, "local");
      state.signedOut++;
      sdkSession = null;
      callback("SIGNED_OUT", null);
    },
  };
  const storage = {
    getPersistedSupabaseSession: async () => state.saved,
    setPersistedSupabaseSession: async (value) => {
      state.saved = value;
    },
    clearAllAuthPersistence: async () => {
      state.saved = null;
    },
    authStorage: {
      removeItem: async (key) => {
        state.removed.push(key);
      },
    },
    writeJson: async () => {},
    STORE_KEYS: { AUTH_PROFILE: "profile" },
  };
  const { sessionClient: client } = load(
    "lib/sessionClient.ts",
    {
      "./supabase": {
        supabase: { auth },
        SUPABASE_AUTH_STORAGE_KEY: "sdk-session",
      },
      "./store": storage,
    },
    {
      navigator: { onLine: true },
      localStorage: { setItem: () => {} },
      window: {
        addEventListener: (name, handler) => {
          state.events[name] = handler;
        },
      },
    },
  );
  return {
    client,
    state,
    auth,
    storage,
    emit: (value) => callback("TOKEN_REFRESHED", value),
  };
}
test("startup restores one session for concurrent callers and prefers current SDK tokens", async () => {
  const h = harness(session("stale"));
  let calls = 0;
  h.auth.getSession = async () => {
    calls++;
    return { data: { session: session("current", "rotated") }, error: null };
  };
  const results = await Promise.all(
    Array.from({ length: 12 }, () => h.client.getSession()),
  );
  assert.equal(calls, 1);
  assert.ok(results.every((value) => value.access_token === "current"));
  await flush();
  assert.equal(h.state.saved.refresh_token, "rotated");
});
test("temporary SDK failures and null auth events retain the known login", async () => {
  const h = harness();
  await h.client.getSession();
  h.emit(null);
  h.auth.getSession = async () => {
    throw new Error("Offline");
  };
  assert.equal((await h.client.getSession()).user.id, "operator");
  assert.equal(h.client.hasSavedSession(), true);
  assert.equal(h.state.signedOut, 0);
});
test("simultaneous expired requests share one refresh and persist the rotated pair", async () => {
  const h = harness();
  await h.client.getSession();
  const gate = deferred();
  h.auth.refreshSession = async () => {
    h.state.refreshed++;
    await gate.promise;
    return { data: { session: session("new", "rotated") }, error: null };
  };
  const requests = Array.from({ length: 20 }, () => h.client.refresh("old"));
  await flush();
  gate.resolve();
  const results = await Promise.all(requests);
  assert.equal(h.state.refreshed, 1);
  assert.ok(results.every((value) => value.access_token === "new"));
  await flush();
  assert.equal(h.state.saved.refresh_token, "rotated");
  assert.equal((await h.client.refresh("old")).access_token, "new");
  assert.equal(h.state.refreshed, 1);
});
test("every caller settles when refresh fails without clearing the session", async () => {
  const h = harness();
  await h.client.getSession();
  h.auth.refreshSession = async () => {
    h.state.refreshed++;
    throw new Error("503 unavailable");
  };
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () => h.client.refresh("old")),
  );
  assert.ok(results.every((value) => value.status === "rejected"));
  assert.equal(h.state.refreshed, 1);
  assert.equal(h.client.peekSession().access_token, "old");
  assert.equal(h.state.saved.refresh_token, "refresh-old");
});
test("manual logout invalidates an in-flight refresh and removes all durable credentials", async () => {
  const h = harness();
  await h.client.getSession();
  const gate = deferred();
  h.auth.refreshSession = async () => {
    await gate.promise;
    h.emit(session("late"));
    return { data: { session: session("late") }, error: null };
  };
  const pending = h.client.refresh("old");
  const outcome = assert.rejects(pending, /Session changed/);
  await flush();
  await h.client.signOut();
  gate.resolve();
  await outcome;
  await flush();
  assert.equal(await h.client.getSession(), null);
  assert.equal(h.state.saved, null);
  assert.equal(h.state.removed.length, 3);
  assert.equal(h.state.signedOut, 1);
});
test("a manual logout in another tab clears the UI; SDK refresh-failure events do not", async () => {
  const h = harness();
  await h.client.getSession();
  const observed = [];
  h.client.subscribe((value) => observed.push(value));
  h.emit(null);
  assert.equal(observed.length, 0);
  h.state.events.storage({ key: "medpos_manual_signout", newValue: "manual" });
  await flush();
  assert.equal(observed.at(-1), null);
  assert.equal(await h.client.getSession(), null);
  assert.equal(h.state.saved, null);
});
test("legacy token-only installations restore with the refresh credential", async () => {
  const h = harness({ access_token: "old", refresh_token: "legacy" });
  h.auth.getSession = async () => ({ data: { session: null }, error: null });
  h.auth.refreshSession = async (options) => {
    assert.equal(options.refresh_token, "legacy");
    return { data: { session: session("restored") }, error: null };
  };
  assert.equal((await h.client.getSession()).access_token, "restored");
});
test("storage recovery never masquerades as an intentional signed-out session", async () => {
  const h = harness(null);
  h.storage.getPersistedSupabaseSession = async () => {
    throw new Error("storage unavailable");
  };
  h.auth.getSession = async () => {
    throw new Error("storage unavailable");
  };
  assert.equal(await h.client.getSession(), null);
  assert.equal(h.client.hasSavedSession(), true);
});
let retryPolicy;
function apiHarness(client, invalidateQueries = () => Promise.resolve()) {
  return load("lib/api.ts", {
    axios,
    "./apiBaseUrl": { API_BASE_URL: "/api" },
    "./queryClient": { queryClient: { invalidateQueries } },
    "axios-retry": {
      __esModule: true,
      default: (_api, policy) => {
        retryPolicy = policy;
      },
      exponentialDelay: () => 0,
      isNetworkError: () => false,
    },
    "./sessionClient": { sessionClient: client },
  }).default;
}
function unauthorized(config) {
  return new axios.AxiosError(
    "Unauthorized",
    "ERR_BAD_REQUEST",
    config,
    {},
    { status: 401, data: {}, headers: {}, config },
  );
}
test("API refreshes auth/me, retries each 401 once, and never loops on a second 401", async () => {
  let current = session(),
    rotations = 0,
    calls = 0;
  const client = {
    getVersion: () => 0,
    getSession: async () => current,
    refresh: async () => {
      rotations++;
      current = session("new");
      return current;
    },
  };
  const api = apiHarness(client);
  api.defaults.adapter = async (config) => {
    calls++;
    throw unauthorized(config);
  };
  await assert.rejects(api.get("/auth/me"));
  assert.equal(rotations, 1);
  assert.equal(calls, 2);
});
test("bad login credentials never trigger token refresh", async () => {
  let rotations = 0;
  const api = apiHarness({
    getVersion: () => 0,
    getSession: async () => null,
    refresh: async () => {
      rotations++;
    },
  });
  api.defaults.adapter = async (config) => {
    throw unauthorized(config);
  };
  await assert.rejects(api.post("/auth/login"));
  assert.equal(rotations, 0);
});
test("API cannot replay an old account request after manual logout during refresh", async () => {
  let version = 0,
    calls = 0;
  const gate = deferred();
  const api = apiHarness({
    getVersion: () => version,
    getSession: async () => session(),
    refresh: async () => {
      await gate.promise;
      return session("late");
    },
  });
  api.defaults.adapter = async (config) => {
    calls++;
    throw unauthorized(config);
  };
  const pending = assert.rejects(api.get("/inventory"), /Session changed/);
  await flush();
  version++;
  gate.resolve();
  await pending;
  assert.equal(calls, 1);
});
function authHarness(
  savedProfile = { id: "operator", role: "CASHIER", clinic_id: "store" },
) {
  let current = session(),
    version = 0,
    listener;
  const state = { dispatched: [], redirects: [], cleared: 0 };
  const client = {
    getVersion: () => version,
    getSession: async () => current,
    peekSession: () => current,
    hasSavedSession: () => !!current,
    persistProfile: async () => {},
    subscribe: (cb) => {
      listener = cb;
      return () => {};
    },
    signOut: async () => {
      version++;
      current = null;
    },
  };
  const api = {
    get: async () => {
      throw new Error("Offline");
    },
  };
  const { useAuth, observeAuthSession } = load(
    "lib/auth.ts",
    {
      zustand: require("zustand"),
      "./api": api,
      "./sessionClient": { sessionClient: client },
      "./store": {
        readJson: async () => savedProfile,
        STORE_KEYS: { AUTH_PROFILE: "profile" },
      },
      "../state/store": {
        store: { dispatch: (action) => state.dispatched.push(action) },
      },
      "../state/slices": {
        authSlice: { actions: { logout: () => ({ type: "logout" }) } },
      },
      "./queryClient": { queryClient: { clear: () => state.cleared++ } },
      "../utils/stockAlertSession": { clearStockAlertPopupSession: () => {} },
    },
    { window: { location: { replace: (url) => state.redirects.push(url) } } },
  );
  return {
    useAuth,
    observeAuthSession,
    api,
    client,
    state,
    emit: (value) => {
      current = value;
      listener(value);
    },
  };
}
test("cached operator profile stays mounted through server outages without granting OWNER", async () => {
  const h = authHarness();
  await h.useAuth.getState().checkSession();
  assert.equal(h.useAuth.getState().role, "CASHIER");
  assert.equal(h.useAuth.getState().isOwner, false);
  assert.equal(h.useAuth.getState().isRecovering, false);
  const stop = h.observeAuthSession();
  h.emit(session("rotated"));
  assert.equal(h.useAuth.getState().session.access_token, "rotated");
  assert.equal(h.useAuth.getState().role, "CASHIER");
  stop();
  assert.equal(h.state.redirects.length, 0);
});
test("unavailable profile for a saved login shows recovery instead of inventing permissions", async () => {
  const h = authHarness(null);
  await h.useAuth.getState().checkSession();
  assert.equal(h.useAuth.getState().session.user.id, "operator");
  assert.equal(h.useAuth.getState().isRecovering, true);
  assert.equal(h.useAuth.getState().isOwner, false);
  assert.equal(h.useAuth.getState().canBill, false);
});
test("manual logout during profile lookup cannot put the user back into either auth store", async () => {
  const h = authHarness();
  const gate = deferred();
  h.api.get = async () => {
    await gate.promise;
    return {
      data: { user: { id: "operator", role: "OWNER", clinic_id: "store" } },
    };
  };
  const pending = h.useAuth.getState().checkSession();
  await flush();
  await h.useAuth.getState().signOut();
  gate.resolve();
  await pending;
  assert.equal(h.useAuth.getState().session, null);
  assert.equal(h.state.dispatched.at(-1).type, "logout");
  assert.equal(h.state.cleared, 1);
  assert.equal(h.state.redirects[0], "/login");
});
test("routine authenticated requests do not rewrite the same persisted session", async () => {
  const h = harness();
  let writes = 0;
  h.storage.setPersistedSupabaseSession = async (value) => {
    writes++;
    h.state.saved = value;
  };
  for (let i = 0; i < 10; i++) await h.client.getSession();
  await flush();
  assert.equal(writes, 0);
  h.emit(session("rotated", "rotated-refresh"));
  await flush();
  assert.equal(writes, 1);
});
test("desktop store failures are retryable and cannot look like an empty browser session", async () => {
  let calls = 0;
  const native = new Map([["sdk-session", "durable-token"]]);
  const { authStorage } = load(
    "lib/store.ts",
    {
      "@tauri-apps/api/core": { isTauri: () => true },
      "@tauri-apps/plugin-store": {
        load: async () => {
          calls++;
          if (calls === 1) throw new Error("Desktop storage unavailable");
          return { get: async (key) => native.get(key) ?? null };
        },
      },
    },
    { window: {}, localStorage: { getItem: () => null } },
  );
  await assert.rejects(
    authStorage.getItem("sdk-session"),
    /Desktop storage unavailable/,
  );
  assert.equal(await authStorage.getItem("sdk-session"), "durable-token");
  assert.equal(calls, 2);
});
test("browser tokens migrate to durable desktop storage and no stale browser copy survives logout", async () => {
  const native = new Map(),
    browser = new Map([["sdk-session", "old-browser-token"]]);
  const { authStorage } = load(
    "lib/store.ts",
    {
      "@tauri-apps/api/core": { isTauri: () => true },
      "@tauri-apps/plugin-store": {
        load: async () => ({
          get: async (key) => native.get(key) ?? null,
          set: async (key, value) => native.set(key, value),
          delete: async (key) => native.delete(key),
          save: async () => {},
        }),
      },
    },
    {
      window: {},
      localStorage: {
        getItem: (key) => browser.get(key) ?? null,
        removeItem: (key) => browser.delete(key),
      },
    },
  );
  assert.equal(await authStorage.getItem("sdk-session"), "old-browser-token");
  await authStorage.setItem("sdk-session", "rotated-desktop-token");
  assert.equal(browser.has("sdk-session"), false);
  assert.equal(
    await authStorage.getItem("sdk-session"),
    "rotated-desktop-token",
  );
  await authStorage.removeItem("sdk-session");
  assert.equal(await authStorage.getItem("sdk-session"), null);
});
test("background subscription cache writes from a signed-out session are discarded", async () => {
  const h = harness();
  await h.client.getSession();
  const expected = h.client.getVersion();
  let writes = 0;
  h.storage.writeJson = async () => {
    writes++;
  };
  await h.client.signOut();
  await h.client.persistSubscription(
    { entitled: true, showRenewalBanner: false },
    expected,
  );
  assert.equal(writes, 0);
});

test("transient read failures can retry but committed writes are never automatically repeated", () => {
  apiHarness({});
  const error = (method) => ({ config: { method }, response: { status: 503 } });
  assert.equal(retryPolicy.retryCondition(error("get")), true);
  for (const method of ["post", "put", "patch", "delete"])
    assert.equal(retryPolicy.retryCondition(error(method)), false);
  assert.equal(
    retryPolicy.retryCondition({
      config: { method: "get" },
      response: { status: 400 },
    }),
    false,
  );
});

function persistenceHarness(desktop = false, browserValues = new Map(), tabValues = new Map(), nativeValues = new Map()) {
  const storage = values => ({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  });
  const api = load('lib/store.ts', {
    '@tauri-apps/api/core': { isTauri: () => desktop },
    '@tauri-apps/plugin-store': { load: async () => ({
      get: async key => nativeValues.get(key) ?? null,
      set: async (key, value) => nativeValues.set(key, value),
      delete: async key => nativeValues.delete(key),
      save: async () => {},
    }) },
  }, { window: {}, localStorage: storage(browserValues), sessionStorage: storage(tabValues) });
  return { ...api, browserValues, tabValues, nativeValues };
}

test('unchecked Remember me keeps SDK and POS credentials in the current tab and survives a reload', async () => {
  const h = persistenceHarness();
  await h.setSessionPersistence(false, 'sdk-session');
  await h.authStorage.setItem('sdk-session', 'tab-token');
  await h.setPersistedSupabaseSession(session());
  await h.writeJson(h.STORE_KEYS.AUTH_PROFILE, { id: 'operator' });
  assert.equal(h.browserValues.has('sdk-session'), false);
  assert.equal(h.browserValues.has(h.STORE_KEYS.SUPABASE_SESSION), false);
  const reloaded = persistenceHarness(false, h.browserValues, h.tabValues);
  assert.equal(await reloaded.authStorage.getItem('sdk-session'), 'tab-token');
  assert.equal((await reloaded.getPersistedSupabaseSession()).user.id, 'operator');
  const newTab = persistenceHarness(false, h.browserValues);
  assert.equal(await newTab.authStorage.getItem('sdk-session'), null);
  assert.equal(await newTab.getPersistedSupabaseSession(), null);
  await reloaded.authStorage.removeItem('sdk-session');
  await reloaded.clearAllAuthPersistence();
  assert.equal(h.tabValues.has('sdk-session'), false);
  assert.equal(await reloaded.getPersistedSupabaseSession(), null);
});

test('Remember me retains browser login across tabs and clears an older tab-only identity', async () => {
  const h = persistenceHarness();
  await h.setSessionPersistence(false, 'sdk-session');
  await h.authStorage.setItem('sdk-session', 'old-tab-token');
  await h.setSessionPersistence(true, 'sdk-session');
  await h.authStorage.setItem('sdk-session', 'remembered-token');
  await h.setPersistedSupabaseSession(session('remembered'));
  assert.equal(h.tabValues.has('sdk-session'), false);
  const newTab = persistenceHarness(false, h.browserValues);
  assert.equal(await newTab.authStorage.getItem('sdk-session'), 'remembered-token');
  assert.equal((await newTab.getPersistedSupabaseSession()).access_token, 'remembered');
});

test('unchecked Remember me removes desktop durable credentials and writes no new durable tokens', async () => {
  const native = new Map([['sdk-session', 'old-token'], ['supabase_session_json', 'old-pos-token'], ['auth_profile_json', 'old-profile']]);
  const h = persistenceHarness(true, new Map(), new Map(), native);
  await h.setSessionPersistence(false, 'sdk-session');
  assert.equal(native.size, 0);
  await h.authStorage.setItem('sdk-session', 'tab-token');
  await h.setPersistedSupabaseSession(session());
  assert.equal(native.size, 0);
  assert.equal(await h.authStorage.getItem('sdk-session'), 'tab-token');
  const restarted = persistenceHarness(true, h.browserValues, new Map(), native);
  assert.equal(await restarted.authStorage.getItem('sdk-session'), null);
});

test('successful stock changes refresh inventory, notification counts and the dashboard; reads and failed writes do not', async () => {
  const invalidated = [];
  const api = apiHarness({ getVersion: () => 0, getSession: async () => null }, options => {
    invalidated.push(options.queryKey[0]);
    return Promise.resolve();
  });
  api.defaults.adapter = async config => ({ data: {}, status: 200, headers: {}, config });
  for (const url of ['/purchases', '/sales', '/inventory/batches/batch/dispose', '/shortbook/item', '/bulk/medicines']) {
    invalidated.length = 0;
    await api.post(url, {});
    assert.deepEqual(invalidated, ['inventory-radar', 'inventory-disposed', 'clinic-header-alerts', 'clinic-dashboard']);
  }
  invalidated.length = 0;
  await api.get('/inventory/medicines');
  await api.post('/auth/login', {});
  assert.deepEqual(invalidated, []);
  api.defaults.adapter = async () => { throw new Error('Stock update failed'); };
  await assert.rejects(api.post('/purchases', {}));
  assert.deepEqual(invalidated, []);
});
