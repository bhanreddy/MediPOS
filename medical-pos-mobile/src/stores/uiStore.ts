import { create } from 'zustand';
import { getStorageBoolean, setStorageBoolean } from '@/utils/storage';

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
  isDark: boolean;
  toasts: Toast[];
}

interface UIActions {
  toggleTheme: () => void;
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
const TOAST_DURATION_MS = 3000;

/* ─── Store ─────────────────────────────────────────── */

export const useUIStore = create<UIStore>((set) => {
  const addToastFn = (message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: Toast = { id, message, type, variant: type };

    set((state) => ({ toasts: [...state.toasts, toast] }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, TOAST_DURATION_MS);
  };

  const removeToastFn = (id: string) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));

  return {
    isDark: getStorageBoolean(THEME_KEY) ?? false,
    toasts: [],

    toggleTheme: () =>
      set((state) => {
        const next = !state.isDark;
        setStorageBoolean(THEME_KEY, next);
        return { isDark: next };
      }),

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
