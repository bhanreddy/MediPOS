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

  // Fetch subscription but ignore the result for gating purposes
  void tryOnline(() => fetchSubscriptionStatus())
    .then(() => CloudAuthService.applySubscriptionCacheFromServer())
    .catch((err) => console.warn("[Subscription] Status check skipped:", err));

  const ok = await CloudAuthService.ensurePosSessionFromCloud();
  return ok ? 'app' : 'login';
}

export async function routeAfterPasswordLogin(): Promise<AuthGate> {
  try {
    await fetchSubscriptionStatus();
  } catch (err) {
    console.warn("[Subscription] Status check skipped:", err);
  }
  await CloudAuthService.applySubscriptionCacheFromServer().catch(() => undefined);

  const ok = await CloudAuthService.ensurePosSessionFromCloud();
  return ok ? 'app' : 'login';
}
