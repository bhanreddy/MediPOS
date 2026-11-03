import type { ViewStyle } from 'react-native';

/* ─── Color Tokens ──────────────────────────────────── */

interface TextColors {
  primary: string;
  secondary: string;
  tertiary: string;
  inverse: string;
}

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  danger: string;
  dangerLight: string;
  warning: string;
  warningLight: string;
  success: string;
  successLight: string;
  background: string;
  surface: string;
  border: string;
  text: TextColors;
}

const lightColors: ThemeColors = {
  primary: '#2457E6',
  primaryLight: '#EDF2FF',
  accent: '#735396',
  accentLight: '#F3EDF8',
  danger: '#B63D60',
  dangerLight: '#FFF0F4',
  warning: '#94630B',
  warningLight: '#FFF6DC',
  success: '#267552',
  successLight: '#EDF8F1',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#E4E9F2',
  text: {
    primary: '#182338',
    secondary: '#657087',
    tertiary: '#68758B',
    inverse: '#FFFFFF',
  },
};

const darkColors: ThemeColors = {
  primary: '#9DB7FF',
  primaryLight: '#24324A',
  accent: '#BAA6DC',
  accentLight: '#352E4C',
  danger: '#DC94A9',
  dangerLight: '#422C3B',
  warning: '#DAB880',
  warningLight: '#3C3428',
  success: '#85B8A0',
  successLight: '#253D37',
  background: '#121B2C',
  surface: '#1A263B',
  border: '#354159',
  text: {
    primary: '#F2F5FC',
    secondary: '#A9B5C9',
    tertiary: '#8794AC',
    inverse: '#121B2C',
  },
};

/* ─── Typography ────────────────────────────────────── */

const typography = {
  family: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semiBold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    xxxl: 26,
    display: 32,
  },
} as const;

/* ─── Spacing ───────────────────────────────────────── */

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 32,
  huge: 48,
} as const;

/* ─── Border Radius ─────────────────────────────────── */

const radius = {
  input: 12,
  card: 16,
  modal: 16,
  pill: 12,
} as const;

/* ─── Shadows ───────────────────────────────────────── */

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

const shadow: Record<'card' | 'modal' | 'fab', ShadowStyle> = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 5,
    elevation: 1,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  fab: {
    shadowColor: '#2457E6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
};

/** Compatibility tokens for existing callers; all workspace surfaces are opaque. */
const buildGlassMaterial = (dark: boolean) => {
  const c = dark ? darkColors : lightColors;
  return { panel: c.surface, edge: c.border, sheen: [c.surface, c.surface, c.surface] as [string, string, string] };
};
const lightGlass = buildGlassMaterial(false);
const darkGlass = buildGlassMaterial(true);
export const glassMaterial = (dark: boolean) => dark ? darkGlass : lightGlass;

/* ─── Theme Assembly ────────────────────────────────── */

export interface Theme {
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  shadow: Record<'card' | 'modal' | 'fab', ShadowStyle>;
  /** @deprecated Use `shadow` */
  shadows: Record<'card' | 'modal' | 'fab', ShadowStyle>;
}

function buildTheme(colors: ThemeColors): Theme {
  return {
    colors,
    typography,
    spacing,
    radius,
    shadow,
    shadows: shadow, // backward compat — screens reference theme.shadows
  };
}

export const theme = buildTheme(lightColors);
export const darkTheme = buildTheme(darkColors);

/* Re-export individual tokens for legacy imports */
export const colors = lightColors;
export { typography, spacing, radius, shadow as shadows };
