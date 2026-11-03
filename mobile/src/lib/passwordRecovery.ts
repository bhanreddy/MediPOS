import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

let client: SupabaseClient | undefined;
function recoveryClient() {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Password recovery is unavailable. Contact your pharmacy administrator.');
  // Recovery credentials stay separate from the POS session and are never persisted.
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}
export async function sendPasswordReset(email: string) {
  const { error } = await recoveryClient().auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('/reset-password') });
  if (error) throw error;
}
export async function openPasswordResetLink(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.slice(1));
  const query = parsed.searchParams;
  const access = params.get('access_token') || query.get('access_token');
  const refresh = params.get('refresh_token') || query.get('refresh_token');
  if (!access || !refresh) throw new Error('This reset link is invalid or expired. Request a new link from Login.');
  const { error } = await recoveryClient().auth.setSession({ access_token: access, refresh_token: refresh });
  if (error) throw error;
}
export async function updateRecoveredPassword(password: string) {
  const client = recoveryClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
  await client.auth.signOut({ scope: 'local' });
}
