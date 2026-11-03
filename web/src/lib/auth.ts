import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import api from './api';
import { sessionClient } from './sessionClient';
import { readJson, STORE_KEYS } from './store';
import { store } from '../state/store';
import { authSlice } from '../state/slices';
import { queryClient } from './queryClient';
import { clearStockAlertPopupSession } from '../utils/stockAlertSession';

type Role = 'SUPER_ADMIN' | 'OWNER' | 'PHARMACIST' | 'CASHIER' | 'VIEWER';
export interface AuthProfile {
  id: string;
  full_name?: string;
  email?: string;
  clinic_id: string | null;
  role: Role | null;
  clinics?: { name?: string };
}
export interface AuthState {
  session: Session | null;
  user: AuthProfile | null;
  clinic_id: string | null;
  role: Role | null;
  isLoading: boolean;
  isRecovering: boolean;
  isSuperAdmin: boolean;
  isOwner: boolean;
  canBill: boolean;
  canViewReports: boolean;
  signIn: (session: Session, user: AuthProfile) => void;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}
const signedOut = {
  session: null,
  user: null,
  clinic_id: null,
  role: null,
  isLoading: false,
  isRecovering: false,
  isSuperAdmin: false,
  isOwner: false,
  canBill: false,
  canViewReports: false,
};
function identity(session: Session, profile?: AuthProfile | null) {
  const user: AuthProfile =
    profile?.id === session.user.id
      ? profile
      : {
          id: session.user.id,
          email: session.user.email,
          full_name:
            session.user.user_metadata?.full_name ??
            session.user.user_metadata?.name ??
            session.user.email?.split('@')[0],
          clinic_id: null,
          role: null,
        };
  const role = user.role;
  return {
    session,
    user,
    clinic_id: user.clinic_id,
    role,
    isRecovering: false,
    isSuperAdmin: role === 'SUPER_ADMIN',
    isOwner: role === 'OWNER',
    canBill:
      !!role &&
      ['OWNER', 'PHARMACIST', 'CASHIER', 'SUPER_ADMIN'].includes(role),
    canViewReports:
      !!role && ['OWNER', 'PHARMACIST', 'SUPER_ADMIN', 'VIEWER'].includes(role),
  };
}
let checking: Promise<void> | null = null;
export const useAuth = create<AuthState>((set, get) => ({
  ...signedOut,
  isLoading: true,
  signIn: (session, user) => {
    set({ ...identity(session, user), isLoading: false });
    void sessionClient.persistProfile(user).catch(() => {});
  },
  signOut: async () => {
    sessionStorage.removeItem('impersonate_clinic_id');
    sessionStorage.removeItem('impersonate_clinic_name');
    const pending = sessionClient.signOut();
    set(signedOut);
    store.dispatch(authSlice.actions.logout());
    queryClient.clear();
    clearStockAlertPopupSession();
    try {
      await pending;
    } finally {
      window.location.replace('/login');
    }
  },
  checkSession: () => {
    if (checking) return checking;
    const expected = sessionClient.getVersion();
    const attempt = (async () => {
      try {
        const session = await sessionClient.getSession();
        if (expected !== sessionClient.getVersion()) return;
        if (!session) {
          set({
            isLoading: false,
            isRecovering: sessionClient.hasSavedSession(),
          });
          return;
        }
        let profile =
          get().user?.id === session.user.id
            ? get().user
            : await readJson<AuthProfile>(STORE_KEYS.AUTH_PROFILE);
        if (profile?.id !== session.user.id) profile = null;
        // Existing screens stay mounted while the profile is checked in the background.
        if (profile) set({ ...identity(session, profile), isLoading: false });
        try {
          const { data } = await api.get<{ user?: AuthProfile }>('/auth/me');
          if (data.user?.id === session.user.id)
            profile = {
              ...profile,
              ...data.user,
              full_name:
                data.user.full_name ||
                profile?.full_name ||
                session.user.user_metadata?.full_name ||
                session.user.email?.split('@')[0],
            };
        } catch {
          /* Offline/401/5xx never erase a known identity or grant a new role. */
        }
        if (expected !== sessionClient.getVersion()) return;
        set({
          ...identity(sessionClient.peekSession() || session, profile),
          isLoading: false,
          isRecovering: !profile,
        });
        if (profile) await sessionClient.persistProfile(profile);
      } catch {
        if (expected === sessionClient.getVersion())
          set({
            isLoading: false,
            isRecovering: !get().session && sessionClient.hasSavedSession(),
          });
      }
    })();
    checking = attempt;
    void attempt.finally(() => {
      if (checking === attempt) checking = null;
    });
    return attempt;
  },
}));

/** Mount once at the app root, never from an API request or an SDK auth callback. */
export function observeAuthSession() {
  return sessionClient.subscribe((session) => {
    if (!session) {
      useAuth.setState(signedOut);
      store.dispatch(authSlice.actions.logout());
      queryClient.clear();
      return;
    }
    const state = useAuth.getState();
    if (state.session?.user.id === session.user.id) {
      useAuth.setState({
        ...identity(session, state.user),
        isRecovering: state.isRecovering,
      });
    }
  });
}
