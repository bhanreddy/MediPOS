/**
 * PhonePe Payment Gateway — Standard Checkout v2 (OAuth + REST).
 * Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/
 */

type TokenCache = { token: string; expiresAtSec: number };
let tokenCache: TokenCache | null = null;

export function phonePeEndpoints() {
  const env = (Deno.env.get('PHONEPE_ENV') || 'SANDBOX').toUpperCase();
  const production = env === 'PRODUCTION' || env === 'PROD';
  return {
    production,
    oauthUrl: production
      ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    checkoutPayUrl: production
      ? 'https://api.phonepe.com/apis/pg/checkout/v2/pay'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay',
    orderStatusUrl: (merchantOrderId: string) =>
      production
        ? `https://api.phonepe.com/apis/pg/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`
        : `https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`,
  };
}

export async function getPhonePeAuthorizationHeader(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAtSec > now + 120) {
    return `O-Bearer ${tokenCache.token}`;
  }

  const clientId = Deno.env.get('PHONEPE_CLIENT_ID');
  const clientSecret = Deno.env.get('PHONEPE_CLIENT_SECRET');
  const clientVersion = Deno.env.get('PHONEPE_CLIENT_VERSION') || '1';
  if (!clientId || !clientSecret) {
    throw new Error('PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET missing');
  }

  const { oauthUrl } = phonePeEndpoints();
  const body = new URLSearchParams({
    client_id: clientId,
    client_version: clientVersion,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const res = await fetch(oauthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as {
    access_token?: string;
    expires_at?: number;
    message?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(json.message || `PhonePe OAuth failed (${res.status})`);
  }

  const expiresAt = typeof json.expires_at === 'number' ? json.expires_at : now + 25 * 3600;
  tokenCache = { token: json.access_token, expiresAtSec: expiresAt };
  return `O-Bearer ${json.access_token}`;
}

export function merchantHeaders(authz: string): Record<string, string> {
  const mid = Deno.env.get('PHONEPE_MERCHANT_ID');
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authz,
  };
  if (mid) h['X-MERCHANT-ID'] = mid;
  return h;
}
