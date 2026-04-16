import { supabase } from '../lib/supabase';
import { getSubscriptionCache } from '../lib/store';
import { AuthService } from './authService';
import { CloudAuthService } from './cloudAuthService';
import { fetchSubscriptionStatus } from './subscriptionApi';

export type AuthGate = 'login' | 'signup' | 'payment' | 'renewal' | 'app';

async function tryOnline<T>(fn: () => Promise<T>): Promise<T | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Cold start routing: subscription cache + Supabase session + optional online reconciliation.
 */
export async function resolveColdStartGate(): Promise<AuthGate> {
  const hydrated = await CloudAuthService.hydrateSupabaseFromStore();
  const { data: supa } = await supabase.auth.getSession();

  if (!hydrated || !supa.session) {
    const legacy = await AuthService.restoreSession();
    return legacy ? 'app' : 'login';
  }

  await CloudAuthService.persistSessionFromClient();
  const cache = await getSubscriptionCache();

  if (cache?.entitled) {
    const ok = await CloudAuthService.ensurePosSessionFromCloud();
    if (!ok) return 'login';
    void CloudAuthService.applySubscriptionCacheFromServer().catch(() => undefined);
    return 'app';
  }

  const remote = await tryOnline(() => fetchSubscriptionStatus());
  if (remote) {
    await CloudAuthService.applySubscriptionCacheFromServer().catch(() => undefined);

    if (remote.status === 'active') {
      const ok = await CloudAuthService.ensurePosSessionFromCloud();
      return ok ? 'app' : 'login';
    }

    if (remote.status === 'expired') {
      return 'renewal';
    }

    return 'payment';
  }

  return 'payment';
}

export async function routeAfterPasswordLogin(): Promise<AuthGate> {
  let remote;
  try {
    remote = await fetchSubscriptionStatus();
  } catch {
    remote = { status: 'none' as const, plan: null, expires_at: null, subscription_id: null };
  }
  await CloudAuthService.applySubscriptionCacheFromServer().catch(() => undefined);

  if (remote.status === 'active') {
    const ok = await CloudAuthService.ensurePosSessionFromCloud();
    return ok ? 'app' : 'login';
  }
  if (remote.status === 'expired') {
    return 'renewal';
  }

  if (remote.status === 'none') {
    const ok = await CloudAuthService.ensurePosSessionFromCloud();
    if (ok) return 'app';
  }

  return 'payment';
}
