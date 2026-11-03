import type { Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_AUTH_STORAGE_KEY } from './supabase';
import {
  clearAllAuthPersistence,
  getPersistedSupabaseSession,
  setPersistedSupabaseSession,
  authStorage,
  type SubscriptionEntitlementCache,
  writeJson,
  STORE_KEYS,
} from './store';

let active: Session | null = null;
let savedSession = false;
let explicitSignOut = false;
let version = 0;
let restoring: Promise<Session | null> | null = null;
let refreshing: Promise<Session> | null = null;
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<(session: Session | null) => void>();
function queueWrite(work: () => Promise<void>) {
  const result = writes.then(work);
  writes = result.catch(() => undefined);
  return result;
}
function accept(session: Session, expected = version) {
  if (explicitSignOut || expected !== version) return;
  if (active && active.user.id !== session.user.id) ++version;
  const changed =
    !active ||
    active.access_token !== session.access_token ||
    active.refresh_token !== session.refresh_token ||
    active.user.id !== session.user.id ||
    active.user.updated_at !== session.user.updated_at;
  active = session;
  savedSession = true;
  if (!changed) return;
  const ticket = version;
  void queueWrite(async () => {
    if (!explicitSignOut && ticket === version)
      await setPersistedSupabaseSession(session);
  }).catch(() => {
    /* SDK storage still retains the active session. */
  });
  listeners.forEach((listener) => listener(session));
}
// This callback must stay synchronous: SDK calls made here can deadlock its auth lock.
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) accept(session);
  // A null/refresh-failure event is not a request by the operator to sign out.
});

export const sessionClient = {
  getVersion: () => version,
  peekSession: () => active,
  hasSavedSession: () => savedSession || !!active,
  subscribe(listener: (session: Session | null) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  persistProfile(profile: unknown): Promise<void> {
    const expected = version;
    return queueWrite(async () => {
      if (!explicitSignOut && expected === version)
        await writeJson(STORE_KEYS.AUTH_PROFILE, profile);
    });
  },
  persistSubscription(
    cache: SubscriptionEntitlementCache,
    expected = version,
  ): Promise<void> {
    return queueWrite(async () => {
      if (!explicitSignOut && expected === version)
        await writeJson(STORE_KEYS.SUBSCRIPTION_CACHE, cache);
    });
  },
  beginSignIn() {
    explicitSignOut = false;
    ++version;
  },
  async getSession(): Promise<Session | null> {
    if (explicitSignOut) return null;
    if (restoring) return restoring;
    const expected = version;
    const attempt = (async () => {
      let persisted: Session | null = null;
      try {
        if (!active)
          persisted = (await getPersistedSupabaseSession()) as Session | null;
      } catch {
        savedSession = true;
      }
      if (expected !== version || explicitSignOut) return active;
      savedSession = savedSession || !!persisted?.refresh_token;
      if (
        !active &&
        persisted?.user?.id &&
        persisted.access_token &&
        persisted.refresh_token
      )
        active = persisted;
      if (typeof navigator !== 'undefined' && !navigator.onLine && active)
        return active;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (expected !== version || explicitSignOut) return active;
        if (data.session) {
          accept(data.session, expected);
          return active;
        }
        // Restore old installations only when the SDK has no newer session.
        if (!error && !active && persisted?.refresh_token) {
          const restored = await supabase.auth.refreshSession({
            refresh_token: persisted.refresh_token,
          });
          if (restored.data.session) accept(restored.data.session, expected);
        }
      } catch {
        /* Keep the last session during transport/storage failures. */
      }
      return active;
    })();
    restoring = attempt;
    try {
      return await attempt;
    } finally {
      if (restoring === attempt) restoring = null;
    }
  },
  async refresh(failedToken?: string): Promise<Session> {
    if (explicitSignOut) throw new Error('Signed out.');
    // A delayed 401 may belong to the token that has already been replaced.
    if (active && failedToken && active.access_token !== failedToken)
      return active;
    if (refreshing) return refreshing;
    const expected = version;
    const attempt = (async () => {
      const { data: current } = await supabase.auth.getSession();
      if (expected !== version || explicitSignOut)
        throw new Error('Session changed.');
      if (
        current.session &&
        failedToken &&
        current.session.access_token !== failedToken
      ) {
        accept(current.session, expected);
        return current.session;
      }
      const persisted =
        !current.session?.refresh_token && !active?.refresh_token
          ? await getPersistedSupabaseSession()
          : null;
      const token =
        current.session?.refresh_token ??
        active?.refresh_token ??
        persisted?.refresh_token;
      if (!token) throw new Error('Your saved session could not be refreshed.');
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: token,
      });
      if (error || !data.session)
        throw error || new Error('Session refresh failed.');
      if (expected !== version || explicitSignOut)
        throw new Error('Session changed.');
      accept(data.session, expected);
      return data.session;
    })();
    refreshing = attempt;
    try {
      return await attempt;
    } finally {
      if (refreshing === attempt) refreshing = null;
    }
  },
  async signOut(): Promise<void> {
    // Invalidate pending restores/refreshes before any asynchronous work begins.
    explicitSignOut = true;
    ++version;
    active = null;
    savedSession = false;
    try {
      localStorage.setItem(
        'medpos_manual_signout',
        `${Date.now()}-${Math.random()}`,
      );
    } catch {
      /* unavailable */
    }
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      await queueWrite(async () => {
        await Promise.all([
          authStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY),
          authStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`),
          authStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`),
        ]);
        await clearAllAuthPersistence();
      });
    }
  },
};

// A manual sign-out in another tab is explicit user intent; SDK refresh-failure events are not.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key !== 'medpos_manual_signout' || !event.newValue) return;
    explicitSignOut = true;
    ++version;
    active = null;
    savedSession = false;
    void queueWrite(clearAllAuthPersistence).catch(() => {});
    listeners.forEach((listener) => listener(null));
  });
