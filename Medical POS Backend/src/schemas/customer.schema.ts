import { z } from 'zod';

const baseCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().regex(/^[6-9]\d{9}$/).optional().nullable(),
  email: z.string().email().optional().nullable(),
  doctor_name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  clinic_id: z.string().optional(),
});

export const createCustomerSchema = baseCustomerSchema.transform(({ clinic_id, ...rest }) => rest);
export const updateCustomerSchema = baseCustomerSchema.partial().transform(({ clinic_id, ...rest }) => rest);

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  payment_mode: z.enum(['cash', 'upi', 'card', 'bank_transfer']),
  note: z.string().optional(),
});
