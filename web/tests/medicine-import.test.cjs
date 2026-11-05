const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, external = require) {
    const module = { exports: {} };
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    vm.runInNewContext(output, { module, exports: module.exports, TextEncoder, require: name => {
        if (name === '../lib/api') return { post: async (...args) => ({ data: args }) };
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'), external);
        return external(name);
    } });
    return module.exports;
}
const service = load(path.join(root, 'web/src/services/importService.ts'));
const parsed = (csv, kind = 'medicines') => service.parseImportCsv(csv, kind);
test('downloaded template exposes the supported medicine columns with a UTF-8 BOM', () => {
    const template = service.importTemplate('medicines');
    assert.ok(template.startsWith('\uFEFF'));
    const headers = require('papaparse').parse(template.replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data[0];
    assert.deepEqual([...headers].sort(), Object.keys(service.IMPORT_FIELDS.medicines).sort());
    assert.ok(parsed(template).issues.some(issue => /no data rows/.test(issue.message)));
});
test('complete template round-trips all fields, including prescription, units, quoted names and leading zeros', () => {
    const values = {
        name: ' Cefixime, 200 mg ', generic_name: 'Cefixime', manufacturer: 'Maker', category: 'gel', gst_rate: '28',
        hsn_code: '03004', barcode: '00012345', unit: 'tablet', product_type: 'medicine', brand_name: 'Brand',
        composition: 'Cefixime 200 mg', dosage_form: 'Tablet', strength: '200 mg', pack_size: '10 tablets',
        base_unit: 'tablet', sale_unit: 'strip', conversion_factor: '10', marketer: 'Marketer', primary_barcode: '00012345',
        is_schedule_h1: 'yes', prescription_required: 'true', schedule_classification: 'schedule_h1',
        cold_chain_required: '1', storage_instructions: 'Cool, dry place', minimum_margin_percent: '5.5', low_stock_threshold: '20',
    };
    const headers = Object.keys(service.IMPORT_FIELDS.medicines);
    const result = parsed(require('papaparse').unparse([headers, headers.map(key => values[key])]));
    assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
    const row = result.payload[0];
    assert.equal(row.name, 'Cefixime, 200 mg');
    assert.equal(row.hsn_code, '03004'); assert.equal(row.barcode, '00012345');
    assert.equal(row.gst_rate, 28); assert.equal(row.conversion_factor, 10);
    assert.equal(row.product_type, 'MEDICINE'); assert.equal(row.is_schedule_h1, true);
    assert.equal(row.cold_chain_required, true); assert.equal(Object.keys(row).length, headers.length);
});
test('minimal CSV leaves blank optional values for server defaults and preserves leading zeros', () => {
    assert.equal(parsed('name\nOnly name\n').issues.length, 0);
    const result = parsed(' Name ,GST Rate,Barcode\r\nParacetamol,,000001\r\n');
    assert.equal(result.issues.length, 0);
    assert.equal(result.payload[0].barcode, '000001');
    assert.equal(Object.hasOwn(result.payload[0], 'gst_rate'), false);
});
test('malformed CSV, unknown columns, missing headers and duplicate aliases cannot pass', () => {
    for (const csv of ['name,Name\nA,B', 'name,generic,generic_name\nA,B,C', 'name,quantity\nA,1', 'name,\nA,', 'generic_name\nA', 'name\n"unfinished', 'name,barcode\nA,1,2']) assert.ok(parsed(csv).issues.length > 0, csv);
});
test('blank names and invalid numeric, enum and boolean values show source row numbers', () => {
    for (const csv of ['name,gst_rate\nA,13', 'name,conversion_factor\nA,Infinity', 'name,low_stock_threshold\nA,1.5', 'name,minimum_margin_percent\nA,-1', 'name,is_schedule_h1\nA,maybe', 'name,product_type\nA,unknown', 'name,barcode\n ,123']) assert.ok(parsed(csv).issues.some(issue => issue.row === 2), csv);
});
test('empty templates, oversized requests and excess rows are rejected', () => {
    for (const csv of ['', 'name\n', 'name\n' + 'A\n'.repeat(5001), 'name,composition\nA,' + 'a'.repeat(1_900_000)]) assert.ok(parsed(csv).issues.length > 0);
});
test('semicolon CSVs, embedded newlines and blank lines are supported', () => {
    const result = parsed('name;generic_name;barcode\r\n"Brand, special";"First line\nsecond line";0001\r\n\r\n');
    assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
    assert.equal(result.payload[0].generic_name, 'First line\nsecond line'); assert.equal(result.payload[0].barcode, '0001');
});
test('supported GST, enum values and conflicting schedule flags are validated', () => {
    for (const gst of [0, 5, 12, 18, 28]) {
        const result = parsed(`name,gst_rate,schedule_classification\nA,${gst},schedule_x`);
        assert.equal(result.issues.length, 0);
        assert.equal(result.payload[0].gst_rate, gst); assert.equal(result.payload[0].schedule_classification, 'SCHEDULE_X');
    }
    assert.ok(parsed('name,is_schedule_h1,schedule_classification\nA,true,SCHEDULE_X').issues.length > 0);
    assert.ok(parsed('name,low_stock_threshold\nA,2147483648').issues.length > 0);
    assert.ok(parsed('name\nBroken \uFFFD').issues.length > 0);
});
test('opening-stock aliases preserve batch numbers and reject impossible dates', () => {
    for (const date of ['2026-02-30', '2026-13-01', '0000-01-01', '11/05/2026']) assert.ok(parsed(`name,batch,expiry,quantity,mrp,cost\nA,B,${date},10,20,10`, 'inventory').issues.length);
    const result = parsed('name,batch,expiry,quantity,mrp,cost,gst_rate\nA,0001,2028-02-29,10,20,10,28', 'inventory');
    assert.equal(result.issues.length, 0); assert.equal(result.payload[0].batch_number, '0001');
});
test('submissions use correct envelopes, a longer timeout and no automatic write retries', async () => {
    for (const [kind, envelope] of [['medicines', 'medicines'], ['customers', 'customers'], ['inventory', 'lines']]) {
        const [url, body, options] = await service.submitImport(kind, [{ name: 'A' }]);
        assert.equal(url, '/bulk/' + kind); assert.equal(body[envelope][0].name, 'A');
        assert.equal(options.timeout, 120000); assert.equal(options['axios-retry'].retries, 0);
    }
});
test('backend validation and conflict messages stay actionable in the UI', () => {
    assert.match(service.importErrorMessage({ response: { data: { details: [{ path: [3, 'gst_rate'], message: 'Invalid GST' }] } } }), /Row 5.*gst_rate.*Invalid GST/);
    assert.match(service.importErrorMessage({ response: { data: { error: { message: 'Barcode conflict' } } } }), /Barcode conflict/);
});
