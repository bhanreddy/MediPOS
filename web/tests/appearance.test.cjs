const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(stored, blocked = false) {
  const values = new Map(stored ? [['theme', stored]] : []), classes = new Set(), listeners = new Map();
  const root = { classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key), add: key => classes.add(key), remove: key => classes.delete(key) }, style: {} };
  const localStorage = { getItem: key => { if (blocked) throw Error('blocked'); return values.get(key) ?? null; }, setItem: (key, value) => { if (blocked) throw Error('blocked'); values.set(key, value); } };
  const context = { document: { documentElement: root }, localStorage, window: { setTimeout: fn => fn(), addEventListener: (key, handler) => listeners.set(key, handler), removeEventListener: key => listeners.delete(key) } };
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useTheme.ts'), 'utf8').replaceAll('import.meta.hot', 'false');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { ...context, module, exports: module.exports, require: name => { assert.equal(name, 'zustand'); return require('zustand'); } });
  return { ...module.exports, values, classes, root, localStorage, storageEvent: event => listeners.get('storage')(event) };
}

for (const preference of [undefined, 'invalid', 'light', 'dark']) {
  test(`startup appearance agrees with the pre-paint HTML bootstrap for ${preference ?? 'a new user'}`, () => {
    const state = load(preference);
    assert.equal(state.root.style.colorScheme, state.useThemeStore.getState().theme);
    assert.equal(state.classes.has('dark'), preference === 'dark');
  });
}
test('switching updates the document, browser controls, persisted selection and subsequent startup', () => {
  const state = load('light');
  for (const next of ['dark', 'light', 'dark']) {
    state.useThemeStore.getState().toggleTheme();
    assert.equal(state.root.style.colorScheme, next);
    assert.equal(state.classes.has('dark'), next === 'dark');
    assert.equal(load(state.values.get('theme')).useThemeStore.getState().theme, next);
  }
  state.classes.delete('dark');
  state.useThemeStore.getState().setTheme('dark');
  assert.equal(state.classes.has('dark'), true);
});
test('another window can change or clear the saved appearance without a reload', () => {
  const state = load('light');
  state.values.set('theme', 'dark');
  state.storageEvent({ key: 'theme', storageArea: state.localStorage });
  assert.equal(state.useThemeStore.getState().theme, 'dark');
  assert.equal(state.root.style.colorScheme, 'dark');
  state.values.clear();
  state.storageEvent({ key: null, storageArea: state.localStorage });
  assert.equal(state.useThemeStore.getState().theme, 'light');
  state.storageEvent({ key: 'theme', storageArea: {} });
  assert.equal(state.useThemeStore.getState().theme, 'light');
});
test('blocked browser storage still permits mode switching', () => {
  const state = load(undefined, true);
  state.useThemeStore.getState().toggleTheme();
  assert.equal(state.useThemeStore.getState().theme, 'dark');
  assert.equal(state.root.style.colorScheme, 'dark');
});
