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
    return stored ?? 'dark';
};

export const applyThemeToDocument = (theme: ThemeMode) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
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
        if (get().theme === theme) return;
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

export const useTheme = () => {
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);
    const setTheme = useThemeStore((s) => s.setTheme);
    return { theme, toggleTheme, setTheme };
};
