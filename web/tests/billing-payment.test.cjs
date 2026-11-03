const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
function service(capture) {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/billingService.ts"),
    "utf8",
  );
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        assert.equal(name, "../lib/api");
        return {
          post: async (url, payload, options) => {
            capture({ url, payload, options });
            return { data: { data: { id: "invoice", net_amount: 18 } } };
          },
        };
      },
    },
  );
  return module.exports.BillingService;
}
const cart = [
  {
    product: { id: "medicine", gst_rate: 12 },
    batchId: "batch",
    quantity: 1,
    sellingPrice: 20,
    discountPercent: 10,
  },
];
test("discounted inclusive sale pays the displayed total and disables automatic replay", async () => {
  let saved;
  await service((value) => (saved = value)).finalizeSale(
    cart,
    undefined,
    "cashier",
    "CASH",
    { supplyType: "INTRA" },
  );
  assert.equal(saved.payload.paid_amount, 18);
  assert.equal(saved.payload.price_includes_tax, true);
  assert.equal(saved.payload.items[0].discount_pct, 10);
  assert.equal(saved.options["axios-retry"].retries, 0);
});
test("explicit partial payment survives the credit sale payload", async () => {
  let saved;
  await service((value) => (saved = value)).finalizeSale(
    cart,
    "customer",
    "cashier",
    "DUE",
    { supplyType: "INTRA", paidAmount: 10 },
  );
  assert.equal(saved.payload.paid_amount, 10);
  assert.equal(saved.payload.customer_id, "customer");
});
test("unpaid credit sales default to zero received", async () => {
  let saved;
  await service((value) => (saved = value)).finalizeSale(
    cart,
    "customer",
    "cashier",
    "DUE",
    { supplyType: "INTRA" },
  );
  assert.equal(saved.payload.paid_amount, 0);
});
