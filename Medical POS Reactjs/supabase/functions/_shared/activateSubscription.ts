import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

function computeExpiryIso(plan: string): string {
  const start = new Date();
  if (plan === 'yearly') {
    start.setFullYear(start.getFullYear() + 1);
  } else {
    start.setMonth(start.getMonth() + 1);
  }
  return start.toISOString();
}

export async function activateSubscriptionRow(
  service: SupabaseClient,
  params: {
    id: string;
    plan: string;
    payment_transaction_id: string;
    payment_provider_order_id?: string | null;
  },
): Promise<{ expires_at: string }> {
  const expiresAt = computeExpiryIso(params.plan);
  const startedAt = new Date().toISOString();

  const patch: Record<string, unknown> = {
    status: 'active',
    payment_transaction_id: params.payment_transaction_id,
    started_at: startedAt,
    expires_at: expiresAt,
  };
  if (params.payment_provider_order_id != null) {
    patch.payment_provider_order_id = params.payment_provider_order_id;
  }

  const { error } = await service.from('subscriptions').update(patch).eq('id', params.id);

  if (error) throw new Error(error.message);
  return { expires_at: expiresAt };
}
