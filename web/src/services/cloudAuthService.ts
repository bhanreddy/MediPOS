import { supabase } from '../lib/supabase';
import { sessionClient } from '../lib/sessionClient';
import api from '../lib/api';
import {
  getSubscriptionCache,
  type SubscriptionEntitlementCache,
} from '../lib/store';
import { AuthService } from './authService';
import type { User, AuthSession } from '../core/types';
import { fetchSubscriptionStatus } from './subscriptionApi';
import { store } from '../state/store';
import { authSlice } from '../state/slices';

const CLOUD_SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export const CloudAuthService = {
  async hydrateSupabaseFromStore(): Promise<boolean> {
    return !!(await sessionClient.getSession());
  },

  /**
   * Opens the local POS session (Redux) for the current Supabase user by fetching
   * the authenticated user details directly from the Express API `/auth/me`.
   */
  async ensurePosSessionFromCloud(): Promise<boolean> {
    const expected = sessionClient.getVersion();
    try {
      const s = await sessionClient.getSession();
      if (!s?.user?.id) return false;

      // Fetch the logged-in user profile from the backend Express API /auth/me directly
      const { data } = await api.get('/auth/me');
      const backendUser = data?.user;
      if (
        expected !== sessionClient.getVersion() ||
        !backendUser ||
        backendUser.id !== s.user.id
      ) {
        return false;
      }

      // Map backendUser and Supabase session to the Redux user & session payloads
      const mappedUser: User = {
        id: backendUser.id,
        username: backendUser.email || s.user.email || '',
        password_hash: '', // Cleaned: no longer storing password hashes on the client
        role_id: backendUser.role || 'OWNER',
        name:
          s.user.user_metadata?.full_name ||
          s.user.user_metadata?.name ||
          backendUser.name ||
          backendUser.email?.split('@')[0] ||
          'Operator',
        is_active: true,
        created_at: s.user.created_at || new Date().toISOString(),
        updated_at: s.user.updated_at || new Date().toISOString(),
        last_modified: Date.now(),
      };

      const mappedSession: AuthSession = {
        id: s.access_token.slice(-36) || backendUser.id, // client-generated UUID or token chunk
        user_id: backendUser.id,
        role_id: backendUser.role || 'OWNER',
        permissions: ['ALL'], // Simplified online permissions
        expires_at: s.expires_at
          ? s.expires_at * 1000
          : Date.now() + CLOUD_SESSION_MS,
        is_offline_session: false,
        token: s.access_token,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_modified: Date.now(),
      };

      store.dispatch(
        authSlice.actions.loginSuccess({
          user: mappedUser,
          session: mappedSession,
        }),
      );
      return true;
    } catch (err) {
      console.error(
        '[CloudAuthService] ensurePosSessionFromCloud failed:',
        err,
      );
      return false;
    }
  },

  async persistSessionFromClient(): Promise<void> {
    await sessionClient.getSession();
  },

  async signUpAndPersist(params: {
    email: string;
    password: string;
    name: string;
    shopName: string;
    phone: string;
  }) {
    sessionClient.beginSignIn();
    const { data: response } = await api.post('/auth/register', {
      email: params.email, password: params.password, full_name: params.name,
      clinic_name: params.shopName, phone: params.phone,
    });
    const data = response.data;
    if (data.session) {
      const { error } = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      if (error) throw error;
    }
    return data;
  },

  async signInAndPersist(params: { email: string; password: string }) {
    sessionClient.beginSignIn();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });
    if (error) throw error;
    if (!data.session || !data.user) throw new Error('Sign-in failed');
    return data;
  },

  async applySubscriptionCacheFromServer(): Promise<SubscriptionEntitlementCache> {
    const expected = sessionClient.getVersion();
    const remote = await fetchSubscriptionStatus();
    const prev = (await getSubscriptionCache()) ?? null;

    const entitled = prev?.entitled === true || remote.status === 'active';

    const cache: SubscriptionEntitlementCache = {
      entitled,
      plan: remote.plan ?? undefined,
      expiresAt: remote.expires_at,
      lastServerStatus: remote.status,
      lastCheckedAt: new Date().toISOString(),
      showRenewalBanner: entitled && remote.status === 'expired',
    };

    if (remote.status === 'active') {
      cache.showRenewalBanner = false;
    }

    await sessionClient.persistSubscription(cache, expected);
    return cache;
  },

  async logoutEverywhere(): Promise<void> {
    await AuthService.logout();
  },

  async onPaymentVerified(params: {
    plan: 'monthly' | 'yearly';
    expiresAt: string | null;
  }) {
    const expected = sessionClient.getVersion();
    const cache: SubscriptionEntitlementCache = {
      entitled: true,
      plan: params.plan,
      expiresAt: params.expiresAt,
      lastServerStatus: 'active',
      lastCheckedAt: new Date().toISOString(),
      showRenewalBanner: false,
    };
    await sessionClient.persistSubscription(cache, expected);
    const ok = await this.ensurePosSessionFromCloud();
    if (!ok) {
      throw new Error(
        'Payment verified but the POS session could not start. Sign out, sign in again, then contact support if this persists.',
      );
    }
  },
};
