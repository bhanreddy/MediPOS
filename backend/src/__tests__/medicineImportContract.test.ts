import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { medicineImportFieldsSchema, medicineImportRowSchema } from '../schemas/medicineImport.schema';
import { importIdentity } from '../lib/importIdentity';
import { createMedicineSchema } from '../schemas/medicine.schema';

// Inspect the frontend field contract without requiring web dependencies in backend CI.
const source = readFileSync(path.resolve(__dirname, '../../../web/src/services/importService.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const moduleObject = { exports: {} as { IMPORT_FIELDS: Record<string, Record<string, unknown>> } };
vm.runInNewContext(compiled, { module: moduleObject, exports: moduleObject.exports, require: () => ({}) });

test('frontend medicine template fields exactly match the backend import schema', () => {
  expect(Object.keys(moduleObject.exports.IMPORT_FIELDS.medicines).sort()).toEqual(Object.keys(medicineImportFieldsSchema.shape).sort());
});
test('minimal imports use medicine creation defaults and uniform columns preserve later optional values', () => {
  const a = medicineImportRowSchema.parse({ name: 'First' });
  const b = medicineImportRowSchema.parse({ name: 'Second', generic_name: 'Second generic', manufacturer: 'Maker' });
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  expect(a.generic_name).toBeNull(); expect(b.generic_name).toBe('Second generic');
  const standard = createMedicineSchema.parse({ name: 'First' });
  for (const field of ['gst_rate', 'category', 'unit', 'base_unit', 'sale_unit', 'conversion_factor', 'low_stock_threshold', 'product_type']) {
    expect(a[field as keyof typeof a]).toEqual(standard[field as keyof typeof standard]);
  }
});
test('regulated medicine flags cannot be lost or contradict each other', () => {
  for (const schedule of ['SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X', 'NARCOTIC']) {
    expect(medicineImportRowSchema.parse({ name: 'QA', schedule_classification: schedule }).prescription_required).toBe(true);
  }
  expect(medicineImportRowSchema.parse({ name: 'QA', is_schedule_h1: true })).toMatchObject({ schedule_classification: 'SCHEDULE_H1', prescription_required: true });
  expect(medicineImportRowSchema.parse({ name: 'QA', schedule_classification: 'SCHEDULE_H1' }).is_schedule_h1).toBe(true);
  expect(medicineImportRowSchema.safeParse({ name: 'QA', is_schedule_h1: true, schedule_classification: 'SCHEDULE_X' }).success).toBe(false);
});
test('import rejects tenant identifiers, unsafe numbers and invalid catalog values', () => {
  for (const row of [{ name: ' ' }, { name: 'QA', clinic_id: 'foreign' }, { name: 'QA', organization_id: 'foreign' },
    { name: 'QA', gst_rate: 13 }, { name: 'QA', conversion_factor: Infinity }, { name: 'QA', low_stock_threshold: 2147483648 },
    { name: 'QA', minimum_margin_percent: NaN }, { name: 'QA', is_schedule_h1: 'true' }]) {
    expect(medicineImportRowSchema.safeParse(row).success).toBe(false);
  }
});
test('replay identifiers are deterministic UUIDs and separated by tenant and import kind', () => {
  const clinic = 'bc499f82-0e9e-4c87-9afc-cb133be79062';
  const id = importIdentity(clinic, 'medicine:row');
  expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(importIdentity(clinic, 'medicine:row')).toBe(id);
  expect(importIdentity(clinic, 'opening-stock:row')).not.toBe(id);
  expect(importIdentity('bc499f82-0e9e-4c87-9afc-cb133be79063', 'medicine:row')).not.toBe(id);
});
