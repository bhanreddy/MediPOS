import { useAuthStore } from '@/stores/authStore';
import {
  getSecureRefreshToken,
  setSecureAuthToken,
  setSecureRefreshToken,
} from '@/utils/secureAuthToken';

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchanges Supabase `refresh_token` for new `access_token` (and rotated refresh).
 * Single-flight: concurrent 401s share one refresh.
 */
export function refreshSupabaseAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performRefresh(): Promise<string | null> {
  const refresh = await getSecureRefreshToken();
  if (!refresh) return null;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anon) return null;

  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
    },
    body: JSON.stringify({ refresh_token: refresh }),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    return null;
  }

  const access = data.access_token as string | undefined;
  if (!access) return null;

  const newRefresh = data.refresh_token as string | undefined;

  await setSecureAuthToken(access);
  if (newRefresh) {
    await setSecureRefreshToken(newRefresh);
  }

  useAuthStore.getState().setToken(access);

  return access;
}
