import api from '../lib/api';

export type PlanId = 'monthly' | 'yearly';

export type CreateOrderResponse = {
  redirect_url: string;
  merchant_order_id: string;
  subscription_id: string;
  phonepe_order_id?: string;
};

export type SubscriptionStatusResponse = {
  status: 'active' | 'expired' | 'pending' | 'none';
  plan: PlanId | null;
  expires_at: string | null;
  subscription_id: string | null;
};

export async function createSubscriptionOrder(plan: PlanId): Promise<CreateOrderResponse> {
  const billingCycle = plan === 'yearly' ? 'annual' : 'monthly';
  const res = await api.post('/subscriptions/create', {
    plan_name: plan,
    billing_cycle: billingCycle,
  });
  return res.data.data;
}

export async function verifySubscriptionPayment(payload: {
  merchant_order_id: string;
}): Promise<{ ok: true; subscription_id: string; expires_at: string | null; plan: PlanId }> {
  const res = await api.post('/subscriptions/verify-payment', payload);
  const d = res.data.data;
  return {
    ok: true,
    subscription_id: d.subscription_id,
    expires_at: d.current_period_end ?? null,
    plan: d.plan_name as PlanId,
  };
}

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  try {
    const res = await api.get('/subscriptions/current');
    const sub = res.data.data?.subscription;

    if (!sub) {
      return { status: 'none', plan: null, expires_at: null, subscription_id: null };
    }

    const billingToPlan: Record<string, PlanId> = { monthly: 'monthly', annual: 'yearly' };

    return {
      status: sub.status === 'trial' ? 'active' : sub.status,
      plan: billingToPlan[sub.billing_cycle] ?? 'monthly',
      expires_at: sub.current_period_end ?? sub.trial_end ?? null,
      subscription_id: sub.id,
    };
  } catch (err: unknown) {
    // Subscription managed manually via SuperAdmin — ignore errors, allow access
    console.warn("[Subscription] Status check skipped:", err);
    return { status: 'none', plan: null, expires_at: null, subscription_id: null };
  }
}
