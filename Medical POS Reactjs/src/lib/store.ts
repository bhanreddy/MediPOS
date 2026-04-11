/**
 * Tauri persistent key-value store with browser/localStorage fallback (Vite dev in a normal browser).
 * Used for Supabase session tokens and subscription entitlement cache.
 */
import { isTauri } from '@tauri-apps/api/core';
import { load, type Store } from '@tauri-apps/plugin-store';

const STORE_FILENAME = 'medpos_app_store.json';

let storePromise: Promise<Store | null> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

async function getStore(): Promise<Store | null> {
  if (!isTauriRuntime()) return null;
  if (!storePromise) {
    storePromise = load(STORE_FILENAME, { defaults: {}, autoSave: true }).catch(() => null);
  }
  return storePromise;
}

export const STORE_KEYS = {
  SUPABASE_SESSION: 'supabase_session_json',
  SUBSCRIPTION_CACHE: 'subscription_cache_json',
  CREDENTIAL_SHADOW: 'credential_shadow_json',
} as const;

export type PersistedSupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
};

export type SubscriptionEntitlementCache = {
  /** True after a successful server-side payment verification (or webhook-confirmed active period). */
  entitled: boolean;
  plan?: 'monthly' | 'yearly';
  expiresAt?: string | null;
  lastServerStatus?: 'active' | 'expired' | 'pending' | 'none';
  lastCheckedAt?: string;
  /** When online validation says expired; UI shows a non-blocking renewal banner. */
  showRenewalBanner: boolean;
};

export type CredentialShadow = {
  email: string;
  password_hash: string;
};

async function readRaw(key: string): Promise<string | null> {
  const s = await getStore();
  if (s) {
    const v = await s.get<string>(key);
    return v ?? null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeRaw(key: string, value: string | null): Promise<void> {
  const s = await getStore();
  if (s) {
    if (value === null) await s.delete(key);
    else await s.set(key, value);
    await s.save();
    return;
  }
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export async function readJson<T>(key: string): Promise<T | null> {
  const raw = await readRaw(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown | null): Promise<void> {
  if (value === null) {
    await writeRaw(key, null);
    return;
  }
  await writeRaw(key, JSON.stringify(value));
}

export async function getPersistedSupabaseSession(): Promise<PersistedSupabaseSession | null> {
  return readJson<PersistedSupabaseSession>(STORE_KEYS.SUPABASE_SESSION);
}

export async function setPersistedSupabaseSession(session: PersistedSupabaseSession | null): Promise<void> {
  await writeJson(STORE_KEYS.SUPABASE_SESSION, session);
}

export async function getSubscriptionCache(): Promise<SubscriptionEntitlementCache | null> {
  return readJson<SubscriptionEntitlementCache>(STORE_KEYS.SUBSCRIPTION_CACHE);
}

export async function setSubscriptionCache(cache: SubscriptionEntitlementCache | null): Promise<void> {
  await writeJson(STORE_KEYS.SUBSCRIPTION_CACHE, cache);
}

export async function getCredentialShadow(): Promise<CredentialShadow | null> {
  return readJson<CredentialShadow>(STORE_KEYS.CREDENTIAL_SHADOW);
}

export async function setCredentialShadow(shadow: CredentialShadow | null): Promise<void> {
  await writeJson(STORE_KEYS.CREDENTIAL_SHADOW, shadow);
}

export async function clearAllAuthPersistence(): Promise<void> {
  await setPersistedSupabaseSession(null);
  await setSubscriptionCache(null);
  await setCredentialShadow(null);
}
