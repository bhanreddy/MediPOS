const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const moduleCore = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/invoiceImportCore.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { module: moduleCore, exports: moduleCore.exports });
const core = moduleCore.exports;
const headers = ['Medicine', 'Batch No.', 'Expiry', 'Qty', 'Rate', 'MRP', 'Free', 'GST %', 'Disc %'];
const values = { medicine_name: 'Paracetamol 500mg', batch_number: '00001', expiry_date: '02/2028', quantity: '10', purchase_price: '10.00', mrp: '20', free_quantity: '2', gst_rate: '12%', discount: '10%' };
test('supplier columns map by aliases, with duplicates and required omissions blocked', () => {
  const mapping = core.suggestInvoiceMapping(headers);
  assert.equal(Object.keys(mapping).length, 9);
  assert.equal(core.mappingIssues(mapping).length, 0);
  assert.ok(core.mappingIssues({ ...mapping, quantity: mapping.mrp }).length);
  assert.equal(core.suggestInvoiceMapping(['Qty', 'Quantity']).quantity, undefined);
});
test('expiry formats preserve valid calendar dates and month-only expiry uses month end', () => {
  for (const [input, expected] of [['2/2028', '2028-02-29'], ['02/27', '2027-02-28'], ['30/11/2028', '2028-11-30'], ['2028-01-01', '2028-01-01']]) assert.equal(core.normalizeInvoiceDate(input), expected);
  assert.equal(core.validateInvoiceValues(values, '2026-11-05').length, 0);
  for (const expiry_date of ['2027-02-29', '13/2028', '31/11/2028', '0000-01-01', '2026-11-04']) assert.ok(core.validateInvoiceValues({ ...values, expiry_date }, '2026-11-05').length, expiry_date);
});
test('numeric parsing rejects ambiguous stock counts, exponents and malformed currency', () => {
  assert.equal(core.invoiceNumber('₹ 1,250.50'), 1250.5);
  assert.ok(Number.isNaN(core.invoiceNumber('10+2')));
  for (const quantity of ['10+2', '1e3', '1.5', '-1', '2147483648', '']) assert.ok(core.validateInvoiceValues({ ...values, quantity }, '2026-11-05').length, quantity);
  for (const patch of [{ free_quantity: '-1' }, { gst_rate: '13' }, { discount: '101' }, { mrp: '9' }]) assert.ok(core.validateInvoiceValues({ ...values, ...patch }, '2026-11-05').length);
});
test('invoice totals use commercial rounding for gross, discount and GST separately', () => {
  assert.equal(core.invoiceLineTotal(10, 10, 10, 12), 100.8);
  assert.equal(core.invoiceLineTotal(1, 0.105, 10, 0), 0.1);
  assert.equal(core.invoiceLineTotal(1, 1.005, 0, 0), 1.01);
});
test('mapped rows preserve identifiers and leave totals visible for explicit exclusion', () => {
  const data = [headers, ['Paracetamol 500mg', '00001', '02/2028', '10', '10', '20'], headers, ['TOTAL', '', '', '', '', '']];
  const rows = core.mapInvoiceRows(data, 0, core.suggestInvoiceMapping(headers));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values.batch_number, '00001');
  assert.equal(rows[0].values.expiry_date, '2028-02-29');
  assert.equal(rows[1].sourceRow, 4);
});
test('Excel fraction percentages convert only when explicitly selected and percent text stays unchanged', () => {
  const mapping = core.suggestInvoiceMapping(headers);
  const data = [headers, ['Paracetamol 500mg', '00001', '02/2028', '10', '10', '20', '2', '0.12', '0.10'], ['Paracetamol 500mg', '00002', '02/2028', '10', '10', '20', '2', '12%', '10%']];
  const fraction = core.mapInvoiceRows(data, 0, mapping, 'fraction');
  assert.equal(fraction[0].values.gst_rate, '12'); assert.equal(fraction[0].values.discount, '10');
  assert.equal(fraction[1].values.gst_rate, '12%'); assert.equal(fraction[1].values.discount, '10%');
  assert.equal(core.mapInvoiceRows(data, 0, mapping)[0].values.discount, '0.10');
});
function pdfLine(labels, y, offset = 0) { return labels.map((str, i) => ({ str, x: 20 + i * 90 + offset, y, width: 35 })); }
test('PDF positional parser handles repeat headings and retains all rows on every page', () => {
  const heading = ['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'MRP'];
  const pages = [[...pdfLine(heading, 700), ...pdfLine(['Drug 500mg', '0001', '02/2028', '10', '10', '20'], 680)], [...pdfLine(heading, 700), ...pdfLine(['Drug 250mg', '0002', '03/2028', '5', '8', '15'], 680)]];
  const table = core.pdfInvoiceTable(pages);
  assert.equal(table.length, 3);
  assert.equal(table[1][1], '0001');
  assert.equal(table[2][0], 'Drug 250mg');
});
test('PDF scans, unsupported headings, missing page headings and changing layouts fail closed', () => {
  assert.throws(() => core.pdfInvoiceTable([[]]), /no selectable text/);
  assert.throws(() => core.pdfInvoiceTable([pdfLine(['Hello'], 700)]), /No supported table/);
  const page = [...pdfLine(['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'MRP'], 700), ...pdfLine(['Drug', 'B', '02/2028', '10', '10', '20'], 680)];
  assert.throws(() => core.pdfInvoiceTable([page, pdfLine(['Drug', 'B'], 700)]), /Every PDF page/);
  assert.throws(() => core.pdfInvoiceTable([page, []]), /no selectable text/);
  assert.throws(() => core.pdfInvoiceTable([page, pdfLine(['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'MRP'], 700, 10)]), /layout changes/);
});
