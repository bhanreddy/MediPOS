const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const profile = { medical_name: 'Test pharmacy' };
const item = {
  medicine_id: 'medicine', batch_id: 'batch', quantity: 1, unit_price: 100,
  gst_rate: 12, discount_pct: 10,
  medicines: { name: 'Medicine' },
  medicine_batches: { batch_number: 'B1', expiry_date: '2027-10-25' },
};
function printer(print = () => {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/printerService.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, {
    module, exports: module.exports, console,
    require: name => {
      if (name === '../lib/api') return { get: () => { throw new Error('Unexpected hydration request'); } };
      if (name === './shopProfileService') return { ShopProfileService: { getShopProfileLocal: async () => profile } };
      if (name === '../utils/printBill') return { printBill: print };
      throw new Error('Unexpected import ' + name);
    },
  });
  return module.exports.PrinterService;
}

test('inclusive receipts do not add GST again when the saved final total is missing', async () => {
  let receipt;
  await printer(value => { receipt = value; }).printBill({
    subtotal: 100, discount: 10, gst_amount: 9.64, price_includes_tax: true,
    paid_amount: 50, payment_mode: 'credit', invoice_number: 'INV-1',
  }, [item]);
  assert.equal(receipt.finalTotal, 90);
  assert.equal(receipt.items[0].total, 90);
  assert.equal(receipt.priceIncludesTax, true);
  assert.equal(receipt.paidAmount, 50);
  assert.equal(receipt.balanceDue, 40);
  assert.equal(receipt.paymentMethod, 'Credit');
});

test('canonical saved amounts win over legacy aliases without changing the invoice', async () => {
  let receipt;
  await printer(value => { receipt = value; }).printBill({
    subtotal: 12.34, total_amount: 999, discount: 0, gst_amount: 0,
    net_amount: 12.34, final_amount: 999, paid_amount: 0, balance_due: 12.34,
  }, [{ ...item, total: 12.34, total_amount: 999 }]);
  assert.equal(receipt.subtotal, 12.34);
  assert.equal(receipt.finalTotal, 12.34);
  assert.equal(receipt.items[0].total, 12.34);
  assert.equal(receipt.paidAmount, 0);
  assert.equal(receipt.balanceDue, 12.34);
});

test('legacy exclusive pricing still adds recorded GST and preserves line discounts', async () => {
  let receipt;
  await printer(value => { receipt = value; }).printBill({ total_amount: 100, discount_amount: 10, tax_amount: 18 },
    [{ ...item, gst_rate: 20, discount_amount: 10 }]);
  assert.equal(receipt.finalTotal, 108);
  assert.equal(receipt.items[0].total, 108);
  assert.equal(receipt.paidAmount, undefined);
  assert.equal(receipt.balanceDue, undefined);
});

test('an asynchronous print failure reaches the existing reprint error flow', async () => {
  await assert.rejects(printer(async () => { throw new Error('Print unavailable'); }).printBill({ net_amount: 90 }, [item]), /Print unavailable/);
});
