import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme';

const getStoredTheme = (): ThemeMode | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === 'light' || raw === 'dark') return raw;
        return null;
    } catch {
        return null;
    }
};

export const getInitialTheme = (): ThemeMode => {
    const stored = getStoredTheme();
    return stored ?? 'light';
};

export const applyThemeToDocument = (theme: ThemeMode) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
};

const withNoThemeTransition = (fn: () => void) => {
    const root = document.documentElement;
    root.classList.add('no-theme-transition');
    fn();
    window.setTimeout(() => {
        root.classList.remove('no-theme-transition');
    }, 0);
};

type ThemeStore = {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
};

export const useThemeStore = create<ThemeStore>((set, get) => ({
    theme: getInitialTheme(),

    setTheme: (theme: ThemeMode) => {
        withNoThemeTransition(() => {
            applyThemeToDocument(theme);
            try {
                localStorage.setItem(STORAGE_KEY, theme);
            } catch {
                /* ignore */
            }
            set({ theme });
        });
    },

    toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
    },
}));

// Keep multiple windows in agreement without rewriting the storage event back.
if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        try { if (event.storageArea !== localStorage) return; } catch { return; }
        const theme = getInitialTheme();
        applyThemeToDocument(theme);
        if (useThemeStore.getState().theme !== theme) useThemeStore.setState({ theme });
    };
    window.addEventListener('storage', onStorage);
    if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', onStorage));
}

export const useTheme = () => {
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);
    const setTheme = useThemeStore((s) => s.setTheme);
    return { theme, toggleTheme, setTheme };
};
