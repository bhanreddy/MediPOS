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
  primary: '#0066CC',
  primaryLight: '#E6F1FB',
  accent: '#00B897',
  accentLight: '#E1F5EE',
  danger: '#E53E3E',
  dangerLight: '#FCEBEB',
  warning: '#F6AD55',
  warningLight: '#FAEEDA',
  success: '#38A169',
  successLight: '#EAF3DE',
  background: '#F7F9FC',
  surface: '#FFFFFF',
  border: 'rgba(0,0,0,0.08)',
  text: {
    primary: '#0D1B2A',
    secondary: '#64748B',
    tertiary: '#94A3B8',
    inverse: '#FFFFFF',
  },
};

const darkColors: ThemeColors = {
  primary: '#378ADD',
  primaryLight: '#0C447C',
  accent: '#1D9E75',
  accentLight: '#085041',
  danger: '#FC6B6B',
  dangerLight: '#3D1F1F',
  warning: '#FFB870',
  warningLight: '#3D2F1A',
  success: '#5AD88C',
  successLight: '#1F3D24',
  background: '#0D1B2A',
  surface: '#1A2C3E',
  border: 'rgba(255,255,255,0.08)',
  text: {
    primary: '#F0F4F8',
    secondary: '#94A3B8',
    tertiary: '#64748B',
    inverse: '#0D1B2A',
  },
};

/* ─── Typography ────────────────────────────────────── */

const typography = {
  family: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 28,
    display: 34,
  },
} as const;

/* ─── Spacing ───────────────────────────────────────── */

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/* ─── Border Radius ─────────────────────────────────── */

const radius = {
  input: 8,
  card: 12,
  modal: 16,
  pill: 24,
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
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  fab: {
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
};

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
