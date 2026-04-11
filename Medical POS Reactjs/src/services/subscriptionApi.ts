import { supabase } from '../lib/supabase';

const fnUrl = (name: string) => {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base.replace(/\/$/, '')}/functions/v1/${name}`;
};

async function edgeFunctionHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const anon =
    String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() ||
    String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '').trim();
  if (!anon) throw new Error('Missing VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)');
  return {
    Authorization: `Bearer ${token}`,
    apikey: anon,
    'Content-Type': 'application/json',
  };
}

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
  const headers = await edgeFunctionHeaders();
  const res = await fetch(fnUrl('create-order'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan }),
  });
  const body = (await res.json().catch(() => ({}))) as CreateOrderResponse & { error?: string };
  if (!res.ok) throw new Error(body.error || `create-order failed (${res.status})`);
  return body;
}

export async function verifySubscriptionPayment(payload: {
  merchant_order_id: string;
}): Promise<{ ok: true; subscription_id: string; expires_at: string | null; plan: PlanId }> {
  const headers = await edgeFunctionHeaders();
  const res = await fetch(fnUrl('verify-payment'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    subscription_id?: string;
    expires_at?: string | null;
    plan?: PlanId;
    error?: string;
    order_state?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `verify-payment failed (${res.status})`);
  }
  return {
    ok: true,
    subscription_id: body.subscription_id!,
    expires_at: body.expires_at ?? null,
    plan: body.plan!,
  };
}

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  const headers = await edgeFunctionHeaders();
  const res = await fetch(fnUrl('subscription-status'), { method: 'GET', headers });
  const body = (await res.json().catch(() => ({}))) as SubscriptionStatusResponse & { error?: string };
  if (!res.ok) throw new Error(body.error || `subscription-status failed (${res.status})`);
  return body;
}
