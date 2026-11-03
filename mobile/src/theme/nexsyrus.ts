import { theme, darkTheme } from '@/theme';

const buildPalette = (dark: boolean) => {
  const c = (dark ? darkTheme : theme).colors;
  return {
    background: c.background,
    text: c.text.primary,
    muted: c.text.secondary,
    accent: c.primary,
    buttonText: c.text.inverse,
    edge: c.border,
    grid: c.border,
    solid: c.surface,
    soft: c.primaryLight,
    amber: c.warning,
    rose: c.danger,
    violet: c.accent,
    violetSoft: c.accentLight,
    amberSoft: c.warningLight,
    roseSoft: c.dangerLight,
  };
};
const lightPalette = buildPalette(false);
const darkPalette = buildPalette(true);
export const nexsyPaletteFor = (dark: boolean) => dark ? darkPalette : lightPalette;

/** Brand artwork retains its blue and white contrast in either appearance. */
export const brandBlue = '#2457E6';
