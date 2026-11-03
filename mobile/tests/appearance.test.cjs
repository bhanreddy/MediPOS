const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, setTimeout });
  return module.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function ui(preferences, legacy = new Map()) {
  return load('stores/uiStore.ts', {
    zustand: require('zustand'), '@/lib/uiPreferences': preferences,
    '@/utils/storage': { store: { getString: key => legacy.get(key), set: (key, value) => legacy.set(key, value) } },
  }).useUIStore;
}

test('appearance survives a native restart without the optional MMKV bridge', async () => {
  const disk = new Map();
  const persistence = load('lib/uiPreferences.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-secure-store': { getItemAsync: async key => disk.get(key), setItemAsync: async (key, value) => disk.set(key, value) },
  });
  let store = ui(persistence);
  await store.getState().hydratePreferences();
  store.getState().toggleTheme();
  store.getState().setGlassMode('lightweight');
  await flush();
  store = ui(persistence); // A fresh JS process has no legacy in-memory state.
  assert.equal(store.getState().preferencesReady, false);
  await store.getState().hydratePreferences();
  assert.equal(store.getState().isDark, true);
  assert.equal(store.getState().glassMode, 'lightweight');
  store.getState().toggleTheme();
  await flush();
  store = ui(persistence);
  await store.getState().hydratePreferences();
  assert.equal(store.getState().isDark, false);
  assert.equal(store.getState().glassMode, 'lightweight');
});

test('rapid toggles serialize saves and retain the final selection', async () => {
  const releases = []; const saved = [];
  const store = ui({ readUIPreferences: async () => ({ isDark: false, glassMode: 'adaptive' }), writeUIPreferences: value => new Promise(resolve => releases.push(() => { saved.push(value.isDark); resolve(); })) });
  await store.getState().hydratePreferences();
  for (let i = 0; i < 3; i++) store.getState().toggleTheme();
  await flush();
  assert.equal(releases.length, 1);
  releases.shift()(); await flush();
  releases.shift()(); await flush();
  releases.shift()(); await flush();
  assert.deepEqual(saved, [true, false, true]);
});

test('late hydration cannot overwrite a new selection, and repeated hydration shares one read', async () => {
  let resolve; let reads = 0;
  const store = ui({ readUIPreferences: () => { reads++; return new Promise(done => { resolve = done; }); }, writeUIPreferences: async () => {} });
  const first = store.getState().hydratePreferences();
  assert.equal(first, store.getState().hydratePreferences());
  store.getState().toggleTheme();
  resolve({ isDark: false, glassMode: 'adaptive' });
  await first;
  assert.equal(reads, 1);
  assert.equal(store.getState().isDark, true);
  assert.equal(store.getState().preferencesReady, true);
});

test('unavailable persistence does not block startup or switching modes', async () => {
  const unavailable = async () => { throw Error('storage unavailable'); };
  const store = ui({ readUIPreferences: unavailable, writeUIPreferences: unavailable });
  await store.getState().hydratePreferences();
  assert.equal(store.getState().preferencesReady, true);
  store.getState().toggleTheme(); await flush();
  assert.equal(store.getState().isDark, true);
  store.getState().toggleTheme(); await flush();
  assert.equal(store.getState().isDark, false);
});

test('a legacy persisted choice migrates without resetting appearance', async () => {
  let saved;
  const store = ui({ readUIPreferences: async () => null, writeUIPreferences: async value => { saved = value; } }, new Map([['ui_dark_mode', 'true'], ['ui_glass_mode', 'lightweight']]));
  await store.getState().hydratePreferences(); await flush();
  assert.equal(saved.isDark, true);
  assert.equal(saved.glassMode, 'lightweight');
});

test('dashboard and shared surfaces have readable foreground and button contrast in both modes', () => {
  const tokens = load('theme/index.ts', {});
  const { nexsyPaletteFor, brandBlue } = load('theme/nexsyrus.ts', { '@/theme': tokens });
  const luminance = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((a, n, i) => a + n * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  for (const dark of [false, true]) {
    const p = nexsyPaletteFor(dark);
    for (const bg of [p.background, p.solid]) for (const fg of [p.text, p.muted]) assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg}`);
    assert.ok(contrast(p.buttonText, p.accent) >= 4.5);
    assert.ok(contrast('#FFFFFF', brandBlue) >= 4.5);
  }
  assert.notEqual(nexsyPaletteFor(true).solid, nexsyPaletteFor(false).solid);
});
