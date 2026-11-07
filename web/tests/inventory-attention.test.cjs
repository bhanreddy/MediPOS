const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, Date, Set });
  return module.exports;
}
function core() {
  return load('services/inventoryRadarCore.ts', {
    '../lib/api': {}, './inventoryCatalogue': {}, '../config/appContent': { RADAR_CONFIG: { expiryWarningDays: 30 } },
    './appSettingsService': { AppSettingsService: { getString: async (_key, fallback) => fallback } },
  });
}
const batch = (id, qty, expiry = '2027-12-31', extra = {}) => ({ id, batch_number: id, quantity_remaining: qty, expiry_date: expiry, purchase_price: 2, ...extra });
const med = (id, batches, threshold = 10, extra = {}) => ({ id, name: id, low_stock_threshold: threshold, medicine_batches: batches, ...extra });
const classify = medicines => core().classifyInventory(medicines, '2026-11-05', '2026-12-05');

test('low stock uses total usable stock, includes threshold equality, and counts medicines once', () => {
  const { items, stats } = classify([
    med('healthy', [batch('h1', 6), batch('h2', 6)]),
    med('boundary', [batch('b1', 5), batch('b2', 5)]),
    med('low', [batch('l1', 7)]),
  ]);
  const low = items.filter(item => core().matchesAttentionFilter(item, 'low_stock'));
  assert.deepEqual(Array.from(low, row => row.productId), ['boundary', 'boundary', 'low']);
  assert.equal(stats.criticalStock, 2);
  assert.equal(stats.totalAssets, 5); // Batches, not the sum of units.
  assert.equal(stats.netValuation, 58);
});

test('expiry is independent of low-stock priority and includes expired stock and both window boundaries', () => {
  const { items, stats } = classify([
    med('overlap', [batch('overlap', 1, '2026-11-20')]),
    med('expired', [batch('expired', 100, '2026-11-04')]),
    med('today', [batch('today', 20, '2026-11-05')]),
    med('boundary', [batch('boundary', 20, '2026-12-05')]),
    med('later', [batch('later', 20, '2026-12-06')]),
  ]);
  assert.deepEqual(Array.from(items.filter(row => core().matchesAttentionFilter(row, 'expiring')), row => row.id), ['overlap', 'expired', 'today', 'boundary']);
  assert.equal(stats.nearExpiry, 4);
  assert.equal(stats.criticalStock, 2); // Expired units cannot prevent a stockout.
  assert.ok(items[0].lowStock && items[0].expiring);
});

test('stockouts stay visible without exposing a dispose action on a synthetic row', () => {
  const { items, stats } = classify([med('empty', []), med('depleted', [batch('zero', 0)])]);
  assert.equal(items.length, 2);
  assert.equal(stats.criticalStock, 2);
  assert.equal(stats.totalAssets, 0);
  assert.ok(items.every(row => row.lowStock && !row.expiring && !core().canDisposeBatch(row)));
});

test('disposed, deleted, inactive and zero-quantity stock do not affect available stock or expiry counts', () => {
  const { items, stats } = classify([
    med('one', [batch('valid', 20), batch('disposed', 100, '2026-11-01', { is_disposed: true }), batch('deleted', 100, '2026-11-01', { deleted_at: '2026-11-01' }), batch('zero', 0, '2026-11-01')]),
    med('inactive', [batch('inactive', 1)], 10, { is_active: false }),
    med('deleted', [batch('deleted', 1)], 10, { deleted_at: '2026-11-01' }),
  ]);
  assert.deepEqual(Array.from(items, row => row.id), ['valid']);
  assert.equal(stats.nearExpiry, 0);
  assert.equal(stats.criticalStock, 0);
});

test('zero stock thresholds are respected', () => {
  const { items } = classify([med('one', [batch('one', 1)], 0), med('zero', [], 0)]);
  assert.equal(items[0].lowStock, false);
  assert.equal(items[1].lowStock, true);
});

test('inventory days use the local calendar at midnight', () => {
  assert.equal(core().inventoryDay(new Date(2026, 10, 5, 0, 1)), '2026-11-05');
});

test('notification fallback counts distinct medicines and only open reorder items', async () => {
  const radar = core();
  const { items } = classify([med('low', [batch('a', 1, '2026-11-10'), batch('b', 1)]), med('empty', [])]);
  const { InventoryAlertService } = load('services/inventoryAlertService.ts', {
    '../lib/api': { get: async url => {
      if (url === '/inventory/attention-counts') throw { response: { status: 404 } };
      return { data: { data: [{ id: 'open' }, { id: 'ordered', is_ordered: true }, { id: 'deleted', deleted_at: '2026-11-01' }] } };
    } },
    './inventoryRadarCore': { ...radar, buildRadarItems: async () => items },
  });
  const counts = await InventoryAlertService.getCounts();
  assert.equal(counts.lowStock, 2);
  assert.equal(counts.expiry, 1);
  assert.equal(counts.shortbook, 1);
});

test('notification failures surface instead of falsely reporting healthy stock', async () => {
  const { InventoryAlertService } = load('services/inventoryAlertService.ts', {
    '../lib/api': { get: async () => { throw { response: { status: 503 } }; } },
    './inventoryRadarCore': core(),
  });
  await assert.rejects(InventoryAlertService.getCounts());
});
