import { baseMedicineSchema } from './medicine.schema';
import { z } from 'zod';

// Import only catalog fields. Tenant, relation and sync IDs come from the server.
export const medicineImportFieldsSchema = baseMedicineSchema.omit({
  category_id: true,
  subcategory_id: true,
  preferred_supplier_id: true,
  store_id: true,
  organization_id: true,
  clinic_id: true,
  _local_id: true,
}).extend({
  conversion_factor: z.number().finite().positive().default(1),
  minimum_margin_percent: z.number().finite().min(0).default(0),
  low_stock_threshold: z.number().int().positive().max(2147483647).default(10),
  category: z.string().trim().min(1).default('tablet'),
  unit: z.string().trim().min(1).default('strip'),
  base_unit: z.string().trim().min(1).default('strip'),
  sale_unit: z.string().trim().min(1).default('strip'),
}).strict();

export const medicineImportRowSchema = medicineImportFieldsSchema.refine(row =>
  !row.is_schedule_h1 || ['NONE', 'SCHEDULE_H1'].includes(row.schedule_classification),
  { path: ['schedule_classification'], message: 'is_schedule_h1 conflicts with schedule_classification' },
).transform(row => ({
  // Uniform columns are required by the multi-row PostgreSQL insert.
  ...Object.fromEntries(Object.keys(medicineImportFieldsSchema.shape).map(key => [key, null])),
  ...row,
  barcode: row.barcode || row.primary_barcode || null,
  primary_barcode: row.primary_barcode || row.barcode || null,
  is_schedule_h1: row.is_schedule_h1 || row.schedule_classification === 'SCHEDULE_H1',
  schedule_classification: row.is_schedule_h1 ? 'SCHEDULE_H1' as const : row.schedule_classification,
  prescription_required: row.prescription_required || row.is_schedule_h1 || row.schedule_classification !== 'NONE',
}));
