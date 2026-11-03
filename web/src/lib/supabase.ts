import { createClient } from '@supabase/supabase-js';
import { authStorage } from './store';

// Environment variables should be in .env.local
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://needs-configuration.supabase.co';
const SUPABASE_ANON_KEY =
  String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() ||
  String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '').trim() ||
  'needs-configuration';

/**
 * Supabase Client
 * Handles connection to the authoritative backend.
 */
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
