import { corsHeaders } from '../_shared/cors.ts';
import { activateSubscriptionRow } from '../_shared/activateSubscription.ts';
import { supabaseServiceClient } from '../_shared/supabase.ts';

async function sha256HexUtf8(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
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

    const user = Deno.env.get('PHONEPE_WEBHOOK_USERNAME');
    const pass = Deno.env.get('PHONEPE_WEBHOOK_PASSWORD');
    if (!user || !pass) {
      return new Response(JSON.stringify({ error: 'Webhook credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const expectedHash = await sha256HexUtf8(`${user}:${pass}`);
    const authHeader = (req.headers.get('Authorization') ?? '').trim();
    if (!timingSafeEqual(authHeader.toLowerCase(), expectedHash.toLowerCase())) {
      return new Response(JSON.stringify({ error: 'Invalid webhook authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = (await req.json()) as {
      event?: string;
      payload?: {
        state?: string;
        merchantOrderId?: string;
        orderId?: string;
        paymentDetails?: Array<{ state?: string; transactionId?: string }>;
      };
    };

    const event = payload.event ?? '';
    if (event !== 'checkout.order.completed') {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const p = payload.payload;
    if (!p || p.state !== 'COMPLETED' || !p.merchantOrderId) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const service = supabaseServiceClient();
    const { data: row, error: selErr } = await service
      .from('subscriptions')
      .select('id, plan, status, payment_transaction_id')
      .eq('payment_merchant_order_id', p.merchantOrderId)
      .maybeSingle();

    if (selErr || !row) {
      return new Response(JSON.stringify({ ok: true, note: 'no subscription row' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (row.status === 'active' && row.payment_transaction_id) {
      return new Response(JSON.stringify({ ok: true, idempotent: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const latest = p.paymentDetails?.filter((x) => x.state === 'COMPLETED').pop();
    const txId = latest?.transactionId ?? p.orderId ?? p.merchantOrderId;

    await activateSubscriptionRow(service, {
      id: row.id,
      plan: row.plan,
      payment_transaction_id: txId,
      payment_provider_order_id: p.orderId ?? null,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
