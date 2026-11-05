import { z } from 'zod';
import { dateOnlySchema } from './date.schema';

export const purchaseItemSchema = z.object({
  medicine_id: z.string(),
  batch_number: z.string().min(1),
  expiry_date: dateOnlySchema,  // YYYY-MM-DD
  quantity: z.number().int().positive(),
  free_quantity: z.number().int().min(0).max(2147483647).optional(),
  purchase_price: z.number().finite().positive(),
  mrp: z.number().finite().positive(),
  gst_rate: z.number().refine(v => [0, 5, 12, 18, 28].includes(v)).default(12),
  discount: z.number().finite().min(0).max(100).default(0),
  _local_id: z.string().optional(),
});

export const createPurchaseSchema = z.object({
  invoice_import: z.object({
    request_id: z.string().uuid(),
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    source_filename: z.string().trim().min(1).max(255),
    source_format: z.enum(['csv', 'xlsx', 'pdf']),
  }).optional(),
  reorder_order_id: z.string().uuid().optional(),
  reorder_receipt_id: z.string().uuid().optional(),
  supplier_id: z.string().optional().nullable(),
  store_id: z.string().optional().nullable(),
  counter_id: z.string().optional().nullable(),
  terminal_id: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  invoice_date: dateOnlySchema.optional().nullable(),
  bill_image_url: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(purchaseItemSchema).min(1).max(2000),
  clinic_id: z.string().optional(),
  _local_id: z.string().optional(),
}).transform(({ clinic_id, ...rest }) => rest);

export const csvRowSchema = z.object({
  medicine_name: z.string().min(1),
  generic_name: z.string().optional(),
  manufacturer: z.string().optional(),
  batch_number: z.string().min(1),
  expiry_date: z.string(),
  quantity: z.coerce.number().int().positive(),
  purchase_price: z.coerce.number().positive(),
  mrp: z.coerce.number().positive(),
  gst_rate: z.coerce.number().default(12),
  supplier_name: z.string().optional(),
});

export const updatePaymentSchema = z.object({
  paid_amount: z.number().finite().min(0),
  payment_status: z.enum(['unpaid', 'partial', 'paid']),
});
