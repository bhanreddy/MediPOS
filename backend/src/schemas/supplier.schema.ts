import { z } from 'zod';

const baseSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  is_active: z.boolean().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/).optional().nullable(),
  email: z.string().email().optional().nullable(),
  gstin: z.string().length(15).optional().nullable(),
  drug_licence_number: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  lead_time_days: z.number().int().min(1).max(90).optional(),
  minimum_order_value: z.number().finite().min(0).max(100000000).optional(),
  preferred_channel: z.enum(['MANUAL', 'WHATSAPP', 'SMS']).optional(),
  whatsapp_opt_in: z.boolean().optional(),
  sms_opt_in: z.boolean().optional(),
  clinic_id: z.string().optional(),
});

export const createSupplierSchema = baseSupplierSchema.transform(({ clinic_id, ...rest }) => rest);
export const updateSupplierSchema = baseSupplierSchema.partial().transform(({ clinic_id, ...rest }) => rest);
