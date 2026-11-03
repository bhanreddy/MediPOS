const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => { assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; }, setTimeout });
  return module.exports;
}
const { mobileLayout } = load('theme/mobileLayout.ts');
const { shouldUseOpticalGlass } = load('components/glass/glassPolicy.ts');

test('compact phones and enlarged text keep product cards at readable widths', () => {
  for (const [width, scale] of [[320, 1], [360, 1.3], [390, 1.5], [768, 2]]) {
    const layout = mobileLayout(width, scale);
    const usableCardWidth = (width - 16) / layout.productColumns - 10 - 28;
    assert.ok(usableCardWidth / scale >= 108, `${width}px at ${scale}x text gives cramped product controls`);
  }
  assert.equal(mobileLayout(320).productColumns, 1);
  assert.equal(mobileLayout(390).productColumns, 2);
  assert.equal(mobileLayout(768).productColumns, 3);
  assert.equal(mobileLayout(1024).productColumns, 4);
});

test('dashboard actions reflow before labels become cramped', () => {
  assert.equal(mobileLayout(320).actionColumns, 2);
  assert.equal(mobileLayout(390).actionColumns, 4);
  assert.equal(mobileLayout(390, 1.4).actionColumns, 2);
  assert.equal(mobileLayout(768, 1.5).wide, false);
  assert.equal(mobileLayout(1024).wide, true);
});

test('directory columns use tablet width and fall back when text is enlarged', () => {
  assert.equal(mobileLayout(390).listColumns, 1);
  assert.equal(mobileLayout(768).listColumns, 2);
  assert.equal(mobileLayout(1024).listColumns, 2);
  assert.equal(mobileLayout(1440).listColumns, 3);
  assert.equal(mobileLayout(768, 1.5).listColumns, 1);
  for (const width of [320, 390, 768, 1024, 1440]) {
    for (const scale of [1, 1.3, 1.5, 2]) {
      const { listColumns } = mobileLayout(width, scale);
      assert.ok(((width - 12) / listColumns - 12) / scale >= 144);
    }
  }
});

test('dock targets fit 320px phones and scroll clearance includes the home indicator', () => {
  for (const width of [320, 360, 390, 430, 768, 1024]) {
    for (const scale of [1, 1.3, 1.5, 2]) {
      const layout = mobileLayout(width, scale, 34);
      assert.ok((layout.dockWidth - 12) / 4 >= 44);
      assert.ok(layout.scrollBottom >= layout.dockHeight + layout.dockBottom + 24);
      assert.ok(layout.contentWidth <= width - layout.gutter * 2);
      assert.ok(layout.contentWidth <= 1200);
    }
  }
});

test('live optical material stays out of scrolling cards and lightweight mode', () => {
  assert.equal(shouldUseOpticalGlass('ios', true, false, false, true), true);
  for (const args of [
    ['ios', true, false, false, false],
    ['ios', true, true, false, true],
    ['ios', true, false, true, true],
    ['ios', false, false, false, true],
    ['android', true, false, false, true],
    ['web', true, false, false, true],
  ]) assert.equal(shouldUseOpticalGlass(...args), false);
});


test('lightweight rendering preference survives a restart independently of appearance', () => {
  const disk = new Map();
  const mocks = { '@/lib/uiPreferences': { readUIPreferences: async () => null, writeUIPreferences: async () => {} }, zustand: require('zustand'), '@/utils/storage': { store: { getString: key => disk.get(key), set: (key, value) => disk.set(key, value) } } };
  let ui = load('stores/uiStore.ts', mocks).useUIStore;
  assert.equal(ui.getState().glassMode, 'adaptive');
  ui.getState().setGlassMode('lightweight');
  ui.getState().toggleTheme();
  ui = load('stores/uiStore.ts', mocks).useUIStore;
  assert.equal(ui.getState().glassMode, 'lightweight');
  assert.equal(ui.getState().isDark, true);
  ui.getState().setGlassMode('adaptive');
  ui = load('stores/uiStore.ts', mocks).useUIStore;
  assert.equal(ui.getState().glassMode, 'adaptive');
  assert.equal(ui.getState().isDark, true);
});
