import React, { createContext, useContext, useEffect, useState, useMemo, memo } from 'react';
import { AccessibilityInfo, Appearance, Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { DefaultTheme, DarkTheme, ThemeProvider } from '@react-navigation/native';
import { theme, darkTheme } from '@/theme';
import { useUIStore } from '@/stores/uiStore';

export { nexsyPaletteFor as liquidPalette } from '@/theme/nexsyrus';
export type LiquidPalette = ReturnType<typeof import('@/theme/nexsyrus').nexsyPaletteFor>;

const Preferences = createContext({
  reduceMotion: true,
  reduceTransparency: true,
  lightweight: false,
});
export const useGlassPreferences = () => useContext(Preferences);
export function LiquidGlassProvider({ children }: React.PropsWithChildren) {
  const lightweight = useUIStore((state) => state.glassMode === 'lightweight');
  const preferencesReady = useUIStore((state) => state.preferencesReady);
  const isDark = useUIStore((state) => state.isDark);
  useEffect(() => { void useUIStore.getState().hydratePreferences(); }, []);
  useEffect(() => {
    if (preferencesReady && Platform.OS !== 'web') Appearance.setColorScheme(isDark ? 'dark' : 'light');
  }, [isDark, preferencesReady]);
  const navigationTheme = useMemo(() => {
    const c = (isDark ? darkTheme : theme).colors;
    const base = isDark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: c.background, card: c.surface, text: c.text.primary, border: c.border, primary: c.primary, notification: c.danger } };
  }, [isDark]);
  const [preferences, setPreferences] = useState({
    reduceMotion: true,
    reduceTransparency: true,
  });
  useEffect(() => {
    let mounted = true;
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => setPreferences((p) => ({ ...p, reduceMotion: value })),
    );
    const transparency = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (value) => setPreferences((p) => ({ ...p, reduceTransparency: value })),
    );
    // Resolve separately: Android may not implement the transparency query.
    Promise.resolve().then(() => AccessibilityInfo.isReduceMotionEnabled?.() ?? false)
      .then((reduceMotion) => mounted && setPreferences((p) => ({ ...p, reduceMotion })))
      .catch(() => {});
    Promise.resolve().then(() => AccessibilityInfo.isReduceTransparencyEnabled?.() ?? false)
      .then((reduceTransparency) => mounted && setPreferences((p) => ({ ...p, reduceTransparency })))
      .catch(() => {
        if (mounted) setPreferences((p) => ({ ...p, reduceTransparency: Platform.OS === 'ios' }));
      });
    return () => {
      mounted = false;
      motion?.remove();
      transparency?.remove();
    };
  }, []);
  const value = useMemo(() => ({
    ...preferences,
    lightweight,
    reduceMotion: preferences.reduceMotion || lightweight,
  }), [preferences, lightweight]);
  return (
    <ThemeProvider value={navigationTheme}>
      <Preferences.Provider value={value}>{preferencesReady ? children : <View style={{ flex: 1, backgroundColor: (isDark ? darkTheme : theme).colors.background }} />}</Preferences.Provider>
    </ThemeProvider>
  );
}


/** Kept under the existing name so all screens inherit the same solid Nexsyrus material. */
export function LiquidPanel({ dark, children, style, interactive, tone, material, variant = 'card', ...props }: ViewProps & {
  dark: boolean; variant?: 'card' | 'header'; interactive?: boolean; tone?: 'sapphire' | 'violet' | 'amber'; material?: 'surface' | 'chrome' | 'hero';
}) {
  const c = (dark ? darkTheme : theme).colors;
  return <View {...props} style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }, style, { shadowOpacity: 0, elevation: 0 }, variant === 'header' && { borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, shadowOpacity: 0, elevation: 0 }]}>{children}</View>;
}
/** Compatibility exports: gloss and decorative backdrops have been retired. */
export const LiquidSheen = memo(function LiquidSheen(_props: { dark: boolean; radius?: number }) { return null; });
export const LiquidBackdrop = memo(function LiquidBackdrop(_props: { dark: boolean }) { return null; });
const styles = StyleSheet.create({ panel: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' } });
