import { create } from 'zustand';
import { SecureStorage } from '@/lib/secureStorage';
import { authEventEmitter } from '@/lib/authEventEmitter';
import { queryClient } from '@/api/queryClient';
import { useCartStore } from './cartStore';

function clearTenantData() {
  queryClient.clear();
  useCartStore.getState().clearCart();
}

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
  isBooting: boolean;
  restoreError: boolean;
}

interface AuthActions {
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  /** Load JWT + user from SecureStore. Call after splash mounts. */
  hydrateAuthFromSecureStorage: () => Promise<boolean>;
  /** Save both tokens to SecureStorage (call after login/refresh). */
  saveTokens: (accessToken: string, refreshToken: string) => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

/* ─── Store ─────────────────────────────────────────── */

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isBooting: true,
  restoreError: false,

  hydrateAuthFromSecureStorage: async () => {
    const expected = SecureStorage.getRevision();
    try {
      const [token, userObj] = await Promise.all([
        SecureStorage.getAccessToken(),
        SecureStorage.getUser(),
      ]);
      if (expected !== SecureStorage.getRevision()) return false;
      if (token) {
        const next = userObj as User | null;
        if (get().user?.id !== next?.id || get().user?.clinicId !== next?.clinicId) clearTenantData();
        set({
          token,
          user: userObj as User | null,
          isAuthenticated: true,
          isBooting: false,
          restoreError: false,
        });
        return true;
      }
      set({ isBooting: false, restoreError: false });
      return false;
    } catch {
      if (expected !== SecureStorage.getRevision()) return false;
      set({ isBooting: false, restoreError: true });
      return false;
    }
  },

  saveTokens: async (accessToken: string, refreshToken: string) => {
    clearTenantData();
    set({ user: null });
    const pending = SecureStorage.saveTokens(accessToken, refreshToken);
    const expected = SecureStorage.getRevision();
    await pending;
    if (expected !== SecureStorage.getRevision())
      throw new Error('Session changed during login.');
    set({ token: accessToken, isAuthenticated: true });
  },

  setToken: (newToken: string) => {
    // Kept for backward compatibility — prefer saveTokens for new code
    set({ token: newToken, isAuthenticated: true });
  },

  setUser: (newUser: User) => {
    if (get().user?.id !== newUser.id || get().user?.clinicId !== newUser.clinicId) clearTenantData();
    void SecureStorage.saveUser(newUser).catch(() => {
      // Keep the active session in memory if secure storage is temporarily unavailable.
    });
    set({ user: newUser });
  },

  logout: () => {
    clearTenantData();
    void SecureStorage.clearAll().catch(() => {
      // Memory is cleared synchronously; do not restore a session after manual logout.
    });
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      restoreError: false,
    });
  },
}));

// Refresh updates the token in place. Only explicit logout clears this store.
authEventEmitter.on('TOKEN_REFRESHED', (token: string) => {
  if (useAuthStore.getState().isAuthenticated) useAuthStore.setState({ token });
});

// Re-export store for backward compat with screens that imported { store } from authStore
export { store } from '@/utils/storage';
