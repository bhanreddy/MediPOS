import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

/**
 * Platform-aware auth storage:
 *  • Native → expo-secure-store (encrypted on-device storage)
 *  • Web    → localStorage (expo-secure-store is unsupported on web)
 */
let storageAdapter: {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

if (Platform.OS === 'web') {
  storageAdapter = {
    getItem: (key: string) => {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    setItem: (key: string, value: string) => {
      try { localStorage.setItem(key, value); } catch { /* ignore */ }
    },
    removeItem: (key: string) => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    },
  };
} else {
  // Lazy-import so the web bundle never touches expo-secure-store
  const SecureStore = require('expo-secure-store');
  storageAdapter = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[MedPOS] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in env. Auth will not work.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
