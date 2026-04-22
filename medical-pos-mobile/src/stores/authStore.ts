import { create } from 'zustand';
import {
  getStorageString,
  setStorageString,
  deleteStorageKey,
} from '@/utils/storage';
import {
  deleteSecureAuthToken,
  getSecureAuthToken,
  setSecureAuthToken,
} from '@/utils/secureAuthToken';

/* ─── Types ─────────────────────────────────────────── */

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  clinicId: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  /** Load JWT from SecureStore (and migrate legacy MMKV). Call after splash mounts. */
  hydrateAuthFromSecureStorage: () => Promise<boolean>;
  /** @deprecated Legacy compat — use setToken + setUser instead */
  setAuth: (data: { token: string; clinicId: string; role: string }) => void;
}

type AuthStore = AuthState & AuthActions;

/* ─── Keys ──────────────────────────────────────────── */

const USER_KEY = 'auth_user';

/* ─── Helpers ───────────────────────────────────────── */

function readPersistedUser(): User | null {
  const raw = getStorageString(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

/* ─── Store ─────────────────────────────────────────── */

export const useAuthStore = create<AuthStore>((set) => {
  const user = readPersistedUser();

  return {
    token: null,
    user,
    isAuthenticated: false,

    hydrateAuthFromSecureStorage: async () => {
      const t = await getSecureAuthToken();
      if (t) {
        set({ token: t, isAuthenticated: true });
        return true;
      }
      return false;
    },

    setToken: (newToken: string) => {
      void setSecureAuthToken(newToken);
      set({ token: newToken, isAuthenticated: true });
    },

    setUser: (newUser: User) => {
      setStorageString(USER_KEY, JSON.stringify(newUser));
      set({ user: newUser });
    },

    logout: () => {
      void deleteSecureAuthToken();
      deleteStorageKey(USER_KEY);
      set({ token: null, user: null, isAuthenticated: false });
    },

    setAuth: (data) => {
      void setSecureAuthToken(data.token);
      set({ token: data.token, isAuthenticated: true });
    },
  };
});

// Re-export storage for backward compat with screens that imported { storage } from authStore
export { storage } from '@/utils/storage';
