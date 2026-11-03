import { useUIStore } from '../stores/uiStore';
import { theme as lightTheme, darkTheme } from '@/theme';
import type { Theme } from '@/theme';

interface UseThemeReturn {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
}

export function useTheme(): UseThemeReturn {
  const isDark = useUIStore((s) => s.isDark);
  const toggleTheme = useUIStore((s) => s.toggleTheme);

  return {
    theme: isDark ? darkTheme : lightTheme,
    isDark,
    toggleTheme,
  };
}
