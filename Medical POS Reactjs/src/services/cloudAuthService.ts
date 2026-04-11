import { supabase } from '../lib/supabase';
import { db } from '../db/index';
import {
  getCredentialShadow,
  getPersistedSupabaseSession,
  getSubscriptionCache,
  setCredentialShadow,
  setPersistedSupabaseSession,
  setSubscriptionCache,
  type PersistedSupabaseSession,
  type SubscriptionEntitlementCache,
} from '../lib/store';
import { AuthService } from './authService';
import { BootstrapService, ROLE_IDS } from './bootstrapService';
import type { User } from '../core/types';
import { fetchSubscriptionStatus } from './subscriptionApi';

const CLOUD_SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function sessionToPersisted(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}): PersistedSupabaseSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };
}

async function upsertLocalOperatorUser(params: {
  supabaseUserId: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<User> {
  await BootstrapService.ensureSeed();
  const password_hash = await AuthService.hashPassword(params.password);
  const now = new Date().toISOString();
  const ts = Date.now();

  const conflicting = await db.users.where('username').equals(params.email).first();
  if (conflicting && conflicting.id !== params.supabaseUserId) {
    await db.users.update(conflicting.id, {
      username: `${params.email}__legacy_${conflicting.id.slice(0, 8)}`,
      updated_at: now,
      last_modified: ts,
    });
  }

  const payload: User = {
    id: params.supabaseUserId,
    username: params.email,
    password_hash,
    role_id: ROLE_IDS.ADMIN,
    name: params.displayName,
    is_active: true,
    created_at: now,
    updated_at: now,
    last_modified: ts,
  };

  const existingId = await db.users.get(params.supabaseUserId);
  if (existingId) {
    await db.users.update(params.supabaseUserId, {
      username: params.email,
      password_hash,
      name: params.displayName,
      role_id: ROLE_IDS.ADMIN,
      is_active: true,
      updated_at: now,
      last_modified: ts,
    });
    return { ...existingId, ...payload };
  }

  await db.users.add(payload);
  return payload;
}

export const CloudAuthService = {
  async hydrateSupabaseFromStore(): Promise<boolean> {
    const persisted = await getPersistedSupabaseSession();
    if (!persisted?.access_token || !persisted.refresh_token) return false;

    const { error } = await supabase.auth.setSession({
      access_token: persisted.access_token,
      refresh_token: persisted.refresh_token,
    });

    if (!error) return true;

    const refreshed = await supabase.auth.refreshSession({
      refresh_token: persisted.refresh_token,
    });
    if (refreshed.error || !refreshed.data.session) {
      await setPersistedSupabaseSession(null);
      return false;
    }
    await setPersistedSupabaseSession(sessionToPersisted(refreshed.data.session));
    return true;
  },

  /**
   * Opens the local POS session (Redux + Dexie) for the current Supabase user.
   * Tries credential shadow sync first, then falls back to the local user row created at sign-up/sign-in.
   */
  async ensurePosSessionFromCloud(): Promise<boolean> {
    if (await this.restoreLocalSessionFromShadow()) return true;

    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return false;

    await BootstrapService.ensureSeed();
    const localUser = await db.users.get(uid);
    if (!localUser) return false;

    await AuthService.createSession(localUser, false, { longLivedMs: CLOUD_SESSION_MS });
    return true;
  },

  async persistSessionFromClient(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s?.access_token || !s.refresh_token) {
      await setPersistedSupabaseSession(null);
      return;
    }
    await setPersistedSupabaseSession(sessionToPersisted(s));
  },

  async signUpAndPersist(params: {
    email: string;
    password: string;
    name: string;
    shopName: string;
    phone: string;
  }) {
    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: {
          full_name: params.name,
          shop_name: params.shopName,
          phone: params.phone,
        },
      },
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error(
        'No session after sign up. If email confirmation is enabled in Supabase, disable it for this desktop flow or confirm the email before continuing.'
      );
    }
    await setPersistedSupabaseSession(sessionToPersisted(data.session));
    await setCredentialShadow({ email: params.email, password_hash: await AuthService.hashPassword(params.password) });
    await upsertLocalOperatorUser({
      supabaseUserId: data.user!.id,
      email: params.email,
      password: params.password,
      displayName: params.name,
    });
    return data;
  },

  async signInAndPersist(params: { email: string; password: string }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });
    if (error) throw error;
    if (!data.session || !data.user) throw new Error('Sign-in failed');
    await setPersistedSupabaseSession(sessionToPersisted(data.session));
    await setCredentialShadow({ email: params.email, password_hash: await AuthService.hashPassword(params.password) });

    const meta = data.user.user_metadata as Record<string, string | undefined> | undefined;
    const displayName =
      meta?.full_name || meta?.name || data.user.email?.split('@')[0] || 'Operator';
    await upsertLocalOperatorUser({
      supabaseUserId: data.user.id,
      email: params.email,
      password: params.password,
      displayName,
    });
    return data;
  },

  async restoreLocalSessionFromShadow(): Promise<boolean> {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return false;
    const shadow = await getCredentialShadow();
    if (!shadow || shadow.email.toLowerCase() !== (user.email || '').toLowerCase()) return false;

    await BootstrapService.ensureSeed();
    let localUser = await db.users.get(user.id);
    const now = new Date().toISOString();
    const ts = Date.now();
    if (!localUser) {
      const meta = user.user_metadata as Record<string, string | undefined> | undefined;
      localUser = {
        id: user.id,
        username: user.email || shadow.email,
        password_hash: shadow.password_hash,
        role_id: ROLE_IDS.ADMIN,
        name: meta?.full_name || meta?.name || 'Operator',
        is_active: true,
        created_at: now,
        updated_at: now,
        last_modified: ts,
      };
      await db.users.add(localUser);
    } else {
      await db.users.update(localUser.id, {
        password_hash: shadow.password_hash,
        updated_at: now,
        last_modified: ts,
      });
      localUser = { ...localUser, password_hash: shadow.password_hash };
    }

    await AuthService.createSession(localUser, false, { longLivedMs: CLOUD_SESSION_MS });
    return true;
  },

  async applySubscriptionCacheFromServer(): Promise<SubscriptionEntitlementCache> {
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

    await setSubscriptionCache(cache);
    return cache;
  },

  async logoutEverywhere(): Promise<void> {
    await AuthService.logout();
  },

  async onPaymentVerified(params: { plan: 'monthly' | 'yearly'; expiresAt: string | null }) {
    const cache: SubscriptionEntitlementCache = {
      entitled: true,
      plan: params.plan,
      expiresAt: params.expiresAt,
      lastServerStatus: 'active',
      lastCheckedAt: new Date().toISOString(),
      showRenewalBanner: false,
    };
    await setSubscriptionCache(cache);
    const ok = await this.ensurePosSessionFromCloud();
    if (!ok) {
      throw new Error(
        'Payment verified but the POS session could not start. Sign out, sign in again, then contact support if this persists.',
      );
    }
  },
};
