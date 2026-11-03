import { create } from 'zustand';
import { store } from '@/utils/storage';
import { readUIPreferences, writeUIPreferences, type UIPreferences } from '@/lib/uiPreferences';

/* ─── Types ─────────────────────────────────────────── */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** @deprecated Use `type`. Kept for backward compat with Toast component. */
  variant: ToastType;
}

interface UIState {
  preferencesReady: boolean;
  isDark: boolean;
  glassMode: 'adaptive' | 'lightweight';
  toasts: Toast[];
}

interface UIActions {
  hydratePreferences: () => Promise<void>;
  toggleTheme: () => void;
  setGlassMode: (mode: UIState['glassMode']) => void;
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  /** @deprecated Legacy alias for addToast */
  showToast: (message: string, type?: ToastType) => void;
  /** @deprecated Legacy alias for removeToast */
  hideToast: (id: string) => void;
}

type UIStore = UIState & UIActions;

/* ─── Constants ─────────────────────────────────────── */

const THEME_KEY = 'ui_dark_mode';
const GLASS_KEY = 'ui_glass_mode';

const readLegacy = (key: string) => { try { return store.getString(key); } catch { return undefined; } };
const writeLegacy = (key: string, value: string) => { try { store.set(key, value); } catch { /* Optional native bridge. */ } };
let preferenceRevision = 0;
let hydration: Promise<void> | undefined;
let writes = Promise.resolve();
const persist = (preferences: UIPreferences) => {
  // Serialize writes so a slow earlier toggle cannot overwrite the latest choice.
  writes = writes.then(() => writeUIPreferences(preferences)).catch(() => {});
};

/* ─── Store ─────────────────────────────────────────── */

export const useUIStore = create<UIStore>((set, get) => {
  const addToastFn = (message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: Toast = { id, message, type, variant: type };

    set((state) => ({ toasts: [...state.toasts, toast] }));

    // The provider starts the duration when this message becomes visible.
    // Queued messages must not expire before the operator can read them.
  };

  const removeToastFn = (id: string) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));

  return {
    preferencesReady: false,
    hydratePreferences: () => {
      if (!hydration) {
        const revision = preferenceRevision;
        hydration = readUIPreferences().then((preferences) => {
          if (revision !== preferenceRevision) return;
          if (preferences) {
            set(preferences);
            writeLegacy(THEME_KEY, String(preferences.isDark));
            writeLegacy(GLASS_KEY, preferences.glassMode);
          } else {
            const { isDark, glassMode } = get();
            persist({ isDark, glassMode });
          }
        }).catch(() => {}).finally(() => set({ preferencesReady: true }));
      }
      return hydration;
    },
    isDark: readLegacy(THEME_KEY) === 'true',
    glassMode: readLegacy(GLASS_KEY) === 'lightweight' ? 'lightweight' : 'adaptive',
    setGlassMode: (glassMode) => {
      preferenceRevision++;
      writeLegacy(GLASS_KEY, glassMode);
      set({ glassMode });
      persist({ isDark: get().isDark, glassMode });
    },
    toasts: [],

    toggleTheme: () => {
      preferenceRevision++;
      const isDark = !get().isDark;
      writeLegacy(THEME_KEY, String(isDark));
      set({ isDark });
      persist({ isDark, glassMode: get().glassMode });
    },

    addToast: addToastFn,
    removeToast: removeToastFn,

    // Legacy aliases for backward compatibility with existing screens
    showToast: addToastFn,
    hideToast: removeToastFn,
  };
});

// Legacy alias so existing imports from '@/stores/toastStore' still work
export const useToastStore = useUIStore;
export type ToastVariant = ToastType;
