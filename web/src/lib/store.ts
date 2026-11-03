/**
 * Tauri persistent key-value store with browser/localStorage fallback (Vite dev in a normal browser).
 * Used for Supabase session tokens and subscription entitlement cache.
 */
import { isTauri } from '@tauri-apps/api/core';
import { load, type Store } from '@tauri-apps/plugin-store';

const STORE_FILENAME = 'medpos_app_store.json';
const REMEMBER_SESSION_KEY = 'medpos_remember_session';

export function remembersSession(): boolean {
  try { return localStorage.getItem(REMEMBER_SESSION_KEY) !== 'false'; }
  catch { return true; }
}


let storePromise: Promise<Store | null> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

async function getStore(): Promise<Store | null> {
  if (!isTauriRuntime()) return null;
  if (!storePromise) {
    storePromise = load(STORE_FILENAME, { defaults: {}, autoSave: true }).catch(
      (error) => {
        storePromise = null;
        throw error;
      },
    );
  }
  return storePromise;
}

export const STORE_KEYS = {
  SUPABASE_SESSION: 'supabase_session_json',
  AUTH_PROFILE: 'auth_profile_json',
  SUBSCRIPTION_CACHE: 'subscription_cache_json',
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

async function readRaw(key: string): Promise<string | null> {
  if (!remembersSession()) {
    try { return sessionStorage.getItem(key); }
    catch { throw new Error('Session storage is temporarily unavailable.'); }
  }
  const s = await getStore();
  if (s) {
    const v = await s.get<string>(key);
    if (v != null) return v;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    throw new Error('Saved session storage is temporarily unavailable.');
  }
}

async function writeRaw(key: string, value: string | null): Promise<void> {
  if (!remembersSession()) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    } catch { throw new Error('Session storage is temporarily unavailable.'); }
    const durable = await getStore();
    if (durable) { await durable.delete(key); await durable.save(); }
    return;
  }
  // Discard any old tab-only copy when durable storage is selected.
  try { sessionStorage.removeItem(key); } catch { /* unavailable */ }
  const s = await getStore();
  if (s) {
    if (value === null) await s.delete(key);
    else await s.set(key, value);
    await s.save();
    // Remove the pre-Tauri browser copy after migration, including on sign out.
    try {
      localStorage.removeItem(key);
    } catch {
      /* unavailable */
    }
    return;
  }
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    throw new Error('Saved session storage is temporarily unavailable.');
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

export async function writeJson(
  key: string,
  value: unknown | null,
): Promise<void> {
  if (value === null) {
    await writeRaw(key, null);
    return;
  }
  await writeRaw(key, JSON.stringify(value));
}

export async function getPersistedSupabaseSession(): Promise<PersistedSupabaseSession | null> {
  return readJson<PersistedSupabaseSession>(STORE_KEYS.SUPABASE_SESSION);
}

export async function setPersistedSupabaseSession(
  session: PersistedSupabaseSession | null,
): Promise<void> {
  await writeJson(STORE_KEYS.SUPABASE_SESSION, session);
}

export async function getSubscriptionCache(): Promise<SubscriptionEntitlementCache | null> {
  return readJson<SubscriptionEntitlementCache>(STORE_KEYS.SUBSCRIPTION_CACHE);
}

export async function setSubscriptionCache(
  cache: SubscriptionEntitlementCache | null,
): Promise<void> {
  await writeJson(STORE_KEYS.SUBSCRIPTION_CACHE, cache);
}

export async function clearAllAuthPersistence(): Promise<void> {
  await setPersistedSupabaseSession(null);
  await setSubscriptionCache(null);
  await writeJson(STORE_KEYS.AUTH_PROFILE, null);
}

/** The SDK and application use the same durable storage, including in Tauri. */
export const authStorage = {
  getItem: readRaw,
  setItem: (key: string, value: string) => writeRaw(key, value),
  removeItem: (key: string) => writeRaw(key, null),
};

/** Set before password login so both the SDK and POS respect Remember me. */
export async function setSessionPersistence(remember: boolean, sdkStorageKey: string): Promise<void> {
  const keys = [...Object.values(STORE_KEYS), sdkStorageKey, `${sdkStorageKey}-user`, `${sdkStorageKey}-code-verifier`];
  const durable = await getStore();
  for (const key of keys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    if (durable) await durable.delete(key);
  }
  if (durable) await durable.save();
  localStorage.setItem(REMEMBER_SESSION_KEY, String(remember));
}
