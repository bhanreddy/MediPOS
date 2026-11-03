import { corsHeaders } from '../_shared/cors.ts';
import { supabaseServiceClient, supabaseUserClient } from '../_shared/supabase.ts';

type Plan = 'monthly' | 'yearly';

type Row = {
  id: string;
  plan: Plan;
  status: string;
  expires_at: string | null;
  created_at: string;
};

function buildResponse(row: Row): {
  status: 'active' | 'expired' | 'pending' | 'none';
  plan: Plan | null;
  expires_at: string | null;
  subscription_id: string | null;
} {
  if (row.status === 'pending') {
    return { status: 'pending', plan: row.plan, expires_at: null, subscription_id: row.id };
  }
  if (row.expires_at) {
    const ex = new Date(row.expires_at).getTime();
    if (ex > Date.now()) {
      return { status: 'active', plan: row.plan, expires_at: row.expires_at, subscription_id: row.id };
    }
    return { status: 'expired', plan: row.plan, expires_at: row.expires_at, subscription_id: row.id };
  }
  if (row.status === 'active') {
    return { status: 'active', plan: row.plan, expires_at: row.expires_at, subscription_id: row.id };
  }
  return { status: 'expired', plan: row.plan, expires_at: row.expires_at, subscription_id: row.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'GET') {
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

    const service = supabaseServiceClient();
    const nowIso = new Date().toISOString();

    const { data: activeRow, error: activeErr } = await service
      .from('subscriptions')
      .select('id, plan, status, expires_at, created_at')
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeErr) {
      return new Response(JSON.stringify({ error: activeErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (activeRow) {
      const body = buildResponse(activeRow as Row);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: row, error } = await service
      .from('subscriptions')
      .select('id, plan, status, expires_at, created_at')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!row) {
      return new Response(
        JSON.stringify({
          status: 'none',
          plan: null,
          expires_at: null,
          subscription_id: null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = buildResponse(row as Row);
    return new Response(JSON.stringify(body), {
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
