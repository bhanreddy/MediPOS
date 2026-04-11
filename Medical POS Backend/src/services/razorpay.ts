import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../config/env';

// Initialize Razorpay conditionally so we don't crash without keys
export const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID || 'dummy_key_id',
  key_secret: env.RAZORPAY_KEY_SECRET || 'dummy_key_secret',
});

// Create a Razorpay customer for a clinic
export async function createRazorpayCustomer(params: {
  name: string;
  email: string;
  phone: string;
  clinicId: string;
}): Promise<string> {
  const customer = await razorpay.customers.create({
    name: params.name,
    email: params.email,
    contact: params.phone,
    notes: { clinic_id: params.clinicId },
  });
  return customer.id;
}

// Create subscription
export async function createSubscription(params: {
  razorpayPlanId: string;
  razorpayCustomerId: string;
  clinicId: string;
  totalCount?: number; // number of billing cycles; omit for infinite (e.g. 120 cycles)
}): Promise<any> {
  const subscription = await razorpay.subscriptions.create({
    plan_id: params.razorpayPlanId,
    total_count: params.totalCount || 120,
    quantity: 1,
    notes: { clinic_id: params.clinicId },
    customer_id: params.razorpayCustomerId,
  } as any);
  return subscription;
}

// Verify Razorpay webhook signature
export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return expectedSignature === signature;
}

// Cancel subscription
export async function cancelSubscription(
  razorpaySubscriptionId: string,
  cancelAtEnd = true // true = cancel at period end, false = immediate
): Promise<void> {
  await razorpay.subscriptions.cancel(razorpaySubscriptionId, cancelAtEnd ? 1 : 0);
}
