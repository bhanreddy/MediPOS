import { corsHeaders } from '../_shared/cors.ts';
import { activateSubscriptionRow } from '../_shared/activateSubscription.ts';
import { getPhonePeAuthorizationHeader, merchantHeaders, phonePeEndpoints } from '../_shared/phonepe.ts';
import { supabaseServiceClient, supabaseUserClient } from '../_shared/supabase.ts';

type Body = {
  merchant_order_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = supabaseUserClient(req);
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Body;
    const merchantOrderId = body.merchant_order_id?.trim();
    if (!merchantOrderId) {
      return new Response(JSON.stringify({ error: 'merchant_order_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const service = supabaseServiceClient();
    const { data: row, error: selErr } = await service
      .from('subscriptions')
      .select('id, user_id, plan, status, payment_merchant_order_id')
      .eq('payment_merchant_order_id', merchantOrderId)
      .maybeSingle();

    if (selErr || !row || row.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: 'Subscription order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (row.status === 'active') {
      const { data: full } = await service
        .from('subscriptions')
        .select('expires_at, plan')
        .eq('id', row.id)
        .single();
      return new Response(
        JSON.stringify({
          ok: true,
          subscription_id: row.id,
          expires_at: full?.expires_at ?? null,
          plan: row.plan,
          already_active: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const authz = await getPhonePeAuthorizationHeader();
    const statusUrl = phonePeEndpoints().orderStatusUrl(merchantOrderId);
    const stRes = await fetch(statusUrl, { method: 'GET', headers: merchantHeaders(authz) });
    const st = (await stRes.json()) as {
      state?: string;
      orderId?: string;
      paymentDetails?: Array<{ state?: string; transactionId?: string }>;
      code?: string;
      message?: string;
    };

    if (!stRes.ok) {
      return new Response(JSON.stringify({ error: st.message || st.code || `Status ${stRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (st.state !== 'COMPLETED') {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Payment not completed (order state: ${st.state ?? 'unknown'})`,
          order_state: st.state ?? null,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const latest = st.paymentDetails?.filter((p) => p.state === 'COMPLETED').pop();
    const txId = latest?.transactionId ?? st.orderId ?? merchantOrderId;

    const { expires_at } = await activateSubscriptionRow(service, {
      id: row.id,
      plan: row.plan,
      payment_transaction_id: txId,
      payment_provider_order_id: st.orderId ?? null,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        subscription_id: row.id,
        expires_at,
        plan: row.plan,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
