import * as SecureStore from 'expo-secure-store';

import { store } from '@/utils/storage';

/** Same logical key previously stored in MMKV (`auth_token`). */
const SECURE_TOKEN_KEY = 'auth_token';
const SECURE_REFRESH_KEY = 'auth_refresh_token';

/**
 * Persists JWT in SecureStore (Keychain / Keystore). Migrates from MMKV once if present.
 */
export async function getSecureAuthToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (token) return token;

    const legacy = store.getString(SECURE_TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, legacy);
      store.delete(SECURE_TOKEN_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSecureAuthToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token);
  } catch (err) {
    console.error('Failed to set secure auth token:', err);
  }
}

/** Supabase `refresh_token` from password / refresh grants — stored only in SecureStore. */
export async function getSecureRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function setSecureRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_REFRESH_KEY, token);
  } catch {
    /* refresh failure without secure store — session refresh won't work until next login */
  }
}

async function deleteSecureRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

/** Removes access JWT, refresh token, and legacy MMKV access copy. */
export async function deleteSecureAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  store.delete(SECURE_TOKEN_KEY);
  await deleteSecureRefreshToken();
}
