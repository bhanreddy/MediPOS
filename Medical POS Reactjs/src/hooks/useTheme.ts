import { useCallback, useEffect, useMemo, useState } from 'react';

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

export const useTheme = () => {
    const initial = useMemo<ThemeMode>(() => getInitialTheme(), []);

    const [theme, setTheme] = useState<ThemeMode>(initial);

    useEffect(() => {
        applyThemeToDocument(theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
        }
    }, [theme]);

    const toggleTheme = useCallback(() => {
        withNoThemeTransition(() => {
            setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
        });
    }, []);

    return { theme, toggleTheme };
};
