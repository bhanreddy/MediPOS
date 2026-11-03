const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function lookupService(api = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/productLookupService.ts"),
    "utf8",
  );
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
    require: (name) => {
      assert.equal(name, "../lib/api");
      return api;
    },
  });
  return module.exports;
}

const medicine = {
  id: "cloud-med",
  _local_id: "local-med",
  name: "Medicine",
  is_active: true,
  gst_rate: 12,
  is_schedule_h1: true,
  medicine_batches: [
    {
      id: "late-cloud",
      _local_id: "late-local",
      expiry_date: "2099-01-01",
      quantity_remaining: 7,
      mrp: 25,
    },
    {
      id: "early-cloud",
      _local_id: "early-local",
      expiry_date: "2098-01-01",
      quantity_remaining: 3,
      mrp: 20,
      sales_rate: 18,
    },
    {
      id: "disposed",
      expiry_date: "2097-01-01",
      quantity_remaining: 100,
      is_disposed: true,
    },
    { id: "expired", expiry_date: "2000-01-01", quantity_remaining: 100 },
    { id: "empty", expiry_date: "2097-01-01", quantity_remaining: 0 },
  ],
};

test("search carries the sellable FEFO batch and price needed to add an item without another fetch", () => {
  const service = lookupService();
  const result = service.mapMedicineSearchResult(medicine, false, "2026-10-07");
  assert.equal(result.totalStock, 10);
  assert.equal(result.batchCount, 2);
  assert.equal(result.bestBatchId, "early-local");
  assert.equal(result.bestBatch.quantity_remaining, 3);
  assert.equal(result.bestBatch.sales_rate, 18);
  assert.equal(result.product.prescription_required, true);
  assert.equal(result.product.schedule_classification, "SCHEDULE_H1");
  assert.equal(
    service.resolveBatchFromMedicineDetail(
      [result.bestBatch],
      result.bestBatchId,
    ).id,
    "early-local",
  );
});

test("out-of-stock search results have no selectable batch snapshot", () => {
  const result = lookupService().mapMedicineSearchResult(
    { ...medicine, medicine_batches: [] },
    false,
    "2026-10-07",
  );
  assert.equal(result.totalStock, 0);
  assert.equal(result.bestBatchId, null);
  assert.equal(result.bestBatch, undefined);
});

test("barcode lookup requests one result without unused substitutes and shares stock exclusions", async () => {
  let calls = 0;
  const service = lookupService({
    get: async (url, options) => {
      calls++;
      assert.equal(url, "/inventory/medicines/search");
      assert.equal(options.params.barcode, "123456");
      assert.equal(options.params.limit, 1);
      assert.equal(options.params.include_substitutes, false);
      return { data: { results: [medicine] } };
    },
  });
  assert.equal(await service.ProductLookupService.findByBarcode("  "), null);
  const result = await service.ProductLookupService.findByBarcode(" 123456 ");
  assert.equal(calls, 1);
  assert.equal(result.totalStock, 10);
  assert.equal(result.bestBatchId, "early-local");
});

test('typeahead narrows existing suggestions immediately without retaining unrelated names', () => {
  const { filterSearchResults } = lookupService();
  const results = [
    { product: { name: 'Paracetamol', composition: 'Acetaminophen', barcode: '123456' } },
    { product: { name: 'Pantoprazole', composition: 'Pantoprazole' } },
  ];
  assert.equal(filterSearchResults(results, 'para')[0].product.name, 'Paracetamol');
  assert.equal(filterSearchResults(results, 'AcEt')[0].product.name, 'Paracetamol');
  assert.equal(filterSearchResults(results, '123456')[0].product.name, 'Paracetamol');
  assert.equal(filterSearchResults(results, '999999').length, 0);
  assert.equal(filterSearchResults(results, 'p').length, 0);
});
