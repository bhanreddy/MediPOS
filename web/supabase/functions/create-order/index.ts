import { corsHeaders } from '../_shared/cors.ts';
import { getPhonePeAuthorizationHeader, merchantHeaders, phonePeEndpoints } from '../_shared/phonepe.ts';
import { supabaseServiceClient, supabaseUserClient } from '../_shared/supabase.ts';

type Plan = 'monthly' | 'yearly';

function amountForPlan(plan: Plan): number {
  const monthly = Number(Deno.env.get('MONTHLY_AMOUNT_PAISE') ?? '49900');
  const yearly = Number(Deno.env.get('YEARLY_AMOUNT_PAISE') ?? '479900');
  return plan === 'monthly' ? monthly : yearly;
}

/** PhonePe: merchantOrderId max 63; only [A-Za-z0-9_-] */
function makeMerchantOrderId(subscriptionRowId: string): string {
  const compact = subscriptionRowId.replace(/-/g, '');
  const base = `MPOS-${compact}`;
  return base.length <= 63 ? base : base.slice(0, 63);
}

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

    const body = (await req.json()) as { plan?: Plan };
    const plan = body.plan;
    if (plan !== 'monthly' && plan !== 'yearly') {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const redirectUrl = Deno.env.get('PHONEPE_REDIRECT_URL')?.trim();
    if (!redirectUrl) {
      return new Response(JSON.stringify({ error: 'PHONEPE_REDIRECT_URL not configured on server' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amountPaise = amountForPlan(plan);
    const service = supabaseServiceClient();

    const merchantOrderIdPlaceholder = `pending-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

    const { data: inserted, error: insErr } = await service
      .from('subscriptions')
      .insert({
        user_id: userData.user.id,
        plan,
        status: 'pending',
        payment_merchant_order_id: merchantOrderIdPlaceholder,
        payment_provider_order_id: null,
        payment_transaction_id: null,
        started_at: null,
        expires_at: null,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      return new Response(JSON.stringify({ error: insErr?.message || 'Failed to persist subscription' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const merchantOrderId = makeMerchantOrderId(inserted.id);

    const { error: updErr } = await service
      .from('subscriptions')
      .update({ payment_merchant_order_id: merchantOrderId })
      .eq('id', inserted.id);

    if (updErr) {
      await service.from('subscriptions').delete().eq('id', inserted.id);
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authz = await getPhonePeAuthorizationHeader();
    const { checkoutPayUrl } = phonePeEndpoints();

    const payBody = {
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 1800,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: `MedPOS ${plan} subscription`,
        merchantUrls: {
          redirectUrl,
        },
      },
      metaInfo: {
        udf1: inserted.id,
        udf2: userData.user.id,
        udf3: plan,
      },
    };

    const payRes = await fetch(checkoutPayUrl, {
      method: 'POST',
      headers: merchantHeaders(authz),
      body: JSON.stringify(payBody),
    });

    const payJson = (await payRes.json()) as {
      orderId?: string;
      redirectUrl?: string;
      state?: string;
      code?: string;
      message?: string;
    };

    if (!payRes.ok || !payJson.redirectUrl || !payJson.orderId) {
      await service.from('subscriptions').delete().eq('id', inserted.id);
      return new Response(
        JSON.stringify({
          error: payJson.message || payJson.code || `PhonePe pay failed (${payRes.status})`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await service
      .from('subscriptions')
      .update({ payment_provider_order_id: payJson.orderId })
      .eq('id', inserted.id);

    return new Response(
      JSON.stringify({
        redirect_url: payJson.redirectUrl,
        merchant_order_id: merchantOrderId,
        subscription_id: inserted.id,
        phonepe_order_id: payJson.orderId,
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
