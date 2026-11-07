import { z } from 'zod';

export const saleItemSchema = z.object({
  medicine_id: z.string(),
  batch_id: z.string().optional(),
  allocation_mode: z.enum(['auto','manual']).optional(),
  quantity: z.number().int().positive(),
  mrp: z.number().finite().positive(),
  discount_pct: z.number().finite().min(0).max(100).default(0),
  gst_rate: z.number().refine(v => [0, 5, 12, 18, 28].includes(v)).default(12),
  _local_id: z.string().optional(),
}).transform(item => ({...item, allocation_mode: item.allocation_mode || (item.batch_id ? 'manual' as const : 'auto' as const)}));

const registerFields = {
  register_id: z.string().uuid().optional(),
  register_required: z.boolean().optional(),
};

export const createSaleSchema = z.object({
  ...registerFields,
  park_id: z.string().uuid().optional(),
  place_of_supply_state_code: z.string().regex(/^\d{2}$/).optional(),
  delivery_address: z.string().trim().min(1).max(500).optional(),
  prescription_id: z.string().uuid().optional(),
  dispensing_attestation: z.object({
    signed_original_checked: z.literal(true),
    annotated_and_signed: z.literal(true),
    prescription_register: z.string().trim().min(1).max(100).optional(),
    h1_register: z.string().trim().min(1).max(100).optional(),
    x_register_page: z.string().trim().min(1).max(100).optional(),
    x_duplicate_reference: z.string().trim().min(1).max(100).optional(),
  }).optional(),
  discount_reason: z.string().trim().min(1).max(400).optional(),
  discount_approval_id: z.string().uuid().optional(),
  payments: z.array(z.object({
    tender_type: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT', 'VOUCHER', 'OTHER']),
    amount_paise: z.number().int().positive().max(1_000_000_000),
    reference_number: z.string().trim().max(255).optional(),
  })).min(1).max(20).optional(),
  customer_id: z.string().optional().nullable(),
  store_id: z.string().optional().nullable(),
  counter_id: z.string().optional().nullable(),
  terminal_id: z.string().optional().nullable(),
  discount: z.number().finite().min(0).default(0),
  is_bill_discount_percentage: z.boolean().default(false),
  expected_total_paise: z.number().int().nonnegative().optional(),
  // Customer prices always include GST, including requests from older clients.
  price_includes_tax: z.boolean().default(true).transform(() => true),
  payment_mode: z.enum(['cash', 'upi', 'card', 'credit', 'wallet', 'mixed']).default('cash'),
  payment_status: z.enum(['paid', 'partial', 'credit', 'returned']).default('paid'),
  paid_amount: z.number().finite().min(0).default(0),
  wallet_amount_paise: z.number().int().min(0).max(1000000000).default(0),
  items: z.array(saleItemSchema).min(1),
  clinic_id: z.string().optional(),
  _local_id: z.string().optional(),
}).transform(({ clinic_id, ...rest }) => rest);

export const saleReturnSchema = z.object({
  ...registerFields,
  original_sale_id: z.string().min(1),
  store_id: z.string().optional().nullable(),
  counter_id: z.string().optional().nullable(),
  terminal_id: z.string().optional().nullable(),
  _local_id: z.string().uuid().optional(),
  refund_method: z.enum(['cash','upi','card','original']).default('original'),
  refund_reference: z.string().trim().max(255).optional(),
  expected_refund_paise: z.number().int().nonnegative().optional(),
  items: z.array(z.object({
    sale_item_id: z.string().min(1),
    batch_id: z.string().uuid().optional(),
    quantity: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000).default('Customer return'),
    restock: z.boolean().default(false),
    _local_id: z.string().optional(),
  })).min(1).max(500),
});
