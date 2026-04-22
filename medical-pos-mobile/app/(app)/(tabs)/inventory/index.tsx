/*
 * Glassmorphic Design System v11 — Inventory screen upgrade changelog
 * ─────────────────────────────────────────────────────────────────────────
 * • Deep dark base (#080B14) + radial mesh orbs (accent / teal / violet) behind content
 * • Introduced JS/CSS-equivalent tokens: glass-bg, borders, shine, surfaces 1–3, text tiers, accent glow
 * • Header + tab bar: frosted BlurView, glass borders, inset shadow, top-edge shimmer (LinearGradient)
 * • Search: glass surface, divider after search icon, focus-ready border tokens; 8px spacing grid
 * • Chips + summary: glass pill surfaces; typography scale 11/13/15/18/22/28 (strict)
 * • Medicine cards: glass layer + border + shadow stack; zebra rows via index; outline icons retained
 * • H1 badge: glass-friendly danger treatment; shortbook CTA = secondary glass + accent border
 * • Stock / expiring semantic colors moved to StyleSheet variants (no inline style objects)
 * • FAB: primary fill + accent glow shadow + subtle border; outline add icon
 * • Entrance: FadeInDown (350ms ease, ~12–25px rise) + stagger (50ms cap); preserved FlashList/API/navigation logic
 * • Typography: display via Georgia/serif + negative letter-spacing; body uses system default (no theme Inter)
 * • v11.1 polish: vignette layer, hero title rail + subtitle, search inner shine, card top highlights, gradient icon wells,
 *   softer zebra + spacing, tab indicator glow, FAB dual-stop gradient, list inset for FAB overlap
 * • v11.2 premium pass: forced dark glass chrome (fixes light-header/dark-body clash), Syne + Plus Jakarta fonts,
 *   elevated blur intensities, header scrim stack, glass tab shell, inset card frost, richer mesh, empty states, StatusBar
 * • v11.3 segmented tabs: glass underlay + depth gradient, inset top shine (spec), stronger tab blur, gradient pill indicator
 *   with inner highlight + glow, active label bloom (iOS shadow)
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  type ViewStyle,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Syne_700Bold,
  Syne_600SemiBold,
} from '@expo-google-fonts/syne';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  FadeInDown,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/hooks/useTheme';
import { useMedicines, useLowStock, useExpiringBatches, useStockSummary, useAddToShortbook } from '@/hooks/useInventory';
import { formatCurrency, formatDate } from '@/utils/format';
import type { Medicine, MedicineBatch } from '@/api/inventory';

const TABS = ['All Medicines', 'Low Stock', 'Expiring'];

/** Default glass values — merged with `theme.colors` at runtime. */
const BASE_GLASS_TOKENS = {
  base: '#080B14',
  meshAccent: 'rgba(108, 99, 255, 0.42)',
  meshTeal: 'rgba(29, 158, 117, 0.28)',
  meshNeutral: 'rgba(148, 163, 184, 0.18)',
  glassBg: 'rgba(255,255,255,0.06)',
  glassBgLightSurface: 'rgba(255,255,255,0.45)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glassShine: 'rgba(255,255,255,0.08)',
  surface1: 'rgba(255,255,255,0.03)',
  surface2: 'rgba(255,255,255,0.07)',
  surface3: 'rgba(255,255,255,0.12)',
  accentPrimary: '#6C63FF',
  accentGlow: 'rgba(108, 99, 255, 0.4)',
  textPrimary: 'rgba(255,255,255,0.95)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.30)',
  shadowGlass: 'rgba(0,0,0,0.35)',
  insetShine: 'rgba(255,255,255,0.10)',
  zebraA: 'rgba(255,255,255,0.045)',
  zebraB: 'rgba(255,255,255,0.128)',
  noise: 'rgba(255,255,255,0.04)',
  iconGradientA: 'rgba(108, 99, 255, 0.38)',
  iconGradientB: 'rgba(255, 255, 255, 0.07)',
  vignetteTop: 'rgba(8, 11, 20, 0)',
  vignetteMid: 'rgba(8, 11, 20, 0.55)',
  vignetteBottom: 'rgba(8, 11, 20, 0.92)',
} as const;

type GlassTok = typeof BASE_GLASS_TOKENS;

function hexToRgbInv(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colAlphaInv(hex: string, a: number): string {
  const rgb = hexToRgbInv(hex);
  if (!rgb) return `rgba(59,130,246,${a})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

/** Align inventory glass mesh + typography with global light/dark theme. */
function mergeGlass(colors: import('@/theme').ThemeColors, isDark: boolean): GlassTok {
  return {
    ...BASE_GLASS_TOKENS,
    base: colors.background,
    accentPrimary: colors.primary,
    accentGlow: colAlphaInv(colors.primary, isDark ? 0.4 : 0.22),
    meshAccent: colAlphaInv(colors.primary, isDark ? 0.42 : 0.2),
    meshTeal: colAlphaInv(colors.accent, isDark ? 0.28 : 0.14),
    meshNeutral: isDark ? BASE_GLASS_TOKENS.meshNeutral : 'rgba(100, 116, 139, 0.12)',
    glassBorder: isDark ? BASE_GLASS_TOKENS.glassBorder : 'rgba(15, 23, 42, 0.1)',
    glassBg: isDark ? BASE_GLASS_TOKENS.glassBg : 'rgba(255,255,255,0.55)',
    glassShine: isDark ? BASE_GLASS_TOKENS.glassShine : 'rgba(255,255,255,0.5)',
    surface1: isDark ? BASE_GLASS_TOKENS.surface1 : 'rgba(255,255,255,0.5)',
    surface2: isDark ? BASE_GLASS_TOKENS.surface2 : 'rgba(255,255,255,0.82)',
    surface3: isDark ? BASE_GLASS_TOKENS.surface3 : 'rgba(15, 23, 42, 0.08)',
    textPrimary: colors.text.primary,
    textSecondary: colors.text.secondary,
    textMuted: colors.text.tertiary,
    zebraA: isDark ? BASE_GLASS_TOKENS.zebraA : 'rgba(255,255,255,0.55)',
    zebraB: isDark ? BASE_GLASS_TOKENS.zebraB : 'rgba(248, 250, 252, 0.95)',
    iconGradientA: colAlphaInv(colors.primary, isDark ? 0.38 : 0.28),
    iconGradientB: isDark ? BASE_GLASS_TOKENS.iconGradientB : 'rgba(255,255,255,0.75)',
    vignetteTop: isDark ? BASE_GLASS_TOKENS.vignetteTop : 'rgba(247, 249, 252, 0)',
    vignetteMid: isDark ? BASE_GLASS_TOKENS.vignetteMid : 'rgba(247, 249, 252, 0.5)',
    vignetteBottom: isDark ? BASE_GLASS_TOKENS.vignetteBottom : 'rgba(247, 249, 252, 0.95)',
    noise: isDark ? BASE_GLASS_TOKENS.noise : 'rgba(15, 23, 42, 0.03)',
    shadowGlass: isDark ? BASE_GLASS_TOKENS.shadowGlass : 'rgba(15, 23, 42, 0.12)',
  } as GlassTok;
}

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const;
const RADIUS = { chip: 6, control: 14, card: 20, sheet: 24 } as const;
const TYPE = { micro: 11, caption: 13, body: 15, lead: 18, titleSm: 22, title: 28, display: 36 } as const;

const FONT_DISPLAY_FALLBACK = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string;

const IOS_BLUR = { hero: 58, tab: 68, card: 42 } as const;
const ANDROID_BLUR = { hero: 34, tab: 38, card: 26 } as const;

function blurIntensity(which: keyof typeof IOS_BLUR) {
  return Platform.OS === 'ios' ? IOS_BLUR[which] : ANDROID_BLUR[which];
}

function createStyles(
  g: GlassTok,
  themePrimary: string,
  themePrimaryLight: string,
  themeDanger: string,
  themeDangerLight: string,
  themeWarning: string,
  themeWarningLight: string,
  themeSuccess: string,
  safeTopInset: number,
  fontsReady: boolean
) {
  const displayFont = fontsReady ? 'Syne_700Bold' : FONT_DISPLAY_FALLBACK;

  const textMain = g.textPrimary;
  const textSub = g.textSecondary;
  const textMut = g.textMuted;

  const glassShadow: ViewStyle = Platform.select({
    ios: {
      shadowColor: g.shadowGlass,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.58,
      shadowRadius: 40,
    },
    default: { elevation: 16 },
  }) as ViewStyle;

  const glassShadowInset: ViewStyle = {
    borderWidth: 1,
    borderColor: g.glassBorder,
    ...glassShadow,
  };

  const fabGlow: ViewStyle = Platform.select({
    ios: {
      shadowColor: themePrimary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.55,
      shadowRadius: 22,
    },
    default: { elevation: 14 },
  }) as ViewStyle;

  return StyleSheet.create({
    meshFill: { ...StyleSheet.absoluteFillObject, backgroundColor: g.base },
    meshOrb1: {
      position: 'absolute',
      top: -80,
      right: -60,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: g.meshAccent,
      opacity: 0.65,
    },
    meshOrb2: {
      position: 'absolute',
      top: '38%',
      left: -100,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: g.meshTeal,
      opacity: 0.5,
    },
    meshOrb3: {
      position: 'absolute',
      bottom: -120,
      right: -40,
      width: 320,
      height: 320,
      borderRadius: 160,
      backgroundColor: g.meshNeutral,
      opacity: 0.55,
    },
    meshOrbAccent: {
      position: 'absolute',
      top: '22%',
      right: '8%',
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: g.accentGlow,
      opacity: 0.35,
    },
    noiseOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: g.noise,
      opacity: 0.85,
    },
    meshVignette: {
      ...StyleSheet.absoluteFillObject,
    },
    container: {
      flex: 1,
      backgroundColor: g.base,
      paddingTop: safeTopInset,
    },
    headerBlurWrap: {
      overflow: 'hidden',
      borderBottomLeftRadius: RADIUS.sheet,
      borderBottomRightRadius: RADIUS.sheet,
      position: 'relative',
    },
    headerScrim: {
      ...StyleSheet.absoluteFillObject,
      borderBottomLeftRadius: RADIUS.sheet,
      borderBottomRightRadius: RADIUS.sheet,
      zIndex: 0,
    },
    headerBlur: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: g.glassBorder,
      ...glassShadowInset,
      backgroundColor: 'transparent',
      zIndex: 1,
    },
    headerShimmer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
    },
    titleBlock: {
      marginBottom: SPACING.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    titleAccentRail: {
      width: 4,
      height: 38,
      borderRadius: 2,
      marginRight: SPACING.sm + 4,
      overflow: 'hidden',
    },
    titleWrap: {
      flex: 1,
    },
    title: {
      fontFamily: displayFont,
      fontSize: TYPE.title + 4,
      letterSpacing: -0.038 * (TYPE.title + 4),
      color: textMain,
      fontWeight: '700',
      marginBottom: SPACING.xs,
    },
    titleSubtitle: {
      fontSize: TYPE.caption + 1,
      color: textMut,
      fontWeight: '500',
      letterSpacing: -0.012 * (TYPE.caption + 1),
      lineHeight: Math.round((TYPE.caption + 1) * 1.45),
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_500Medium' as const } : {}),
    },
    searchRowWrap: {
      borderRadius: RADIUS.control + 2,
      overflow: 'hidden',
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: g.glassBorder,
      backgroundColor: g.surface2,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 16,
        },
        default: { elevation: 8 },
      }),
    },
    searchInnerShine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 18,
      opacity: 0.65,
      zIndex: 1,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 50,
      paddingHorizontal: SPACING.sm + 4,
      zIndex: 2,
    },
    searchIconWrap: {
      paddingRight: SPACING.sm,
    },
    searchDivider: {
      width: 1,
      height: 22,
      backgroundColor: g.glassShine,
      marginRight: SPACING.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: TYPE.lead - 3,
      color: textMain,
      fontWeight: '500',
      paddingVertical: SPACING.sm,
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_500Medium' as const } : {}),
    },
    summaryRow: {
      marginBottom: SPACING.xs,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    chipGlass: {
      paddingHorizontal: SPACING.sm + 4,
      paddingVertical: SPACING.sm - 2,
      borderRadius: RADIUS.chip + 2,
      borderWidth: 1,
      borderColor: g.glassBorder,
      backgroundColor: g.surface1,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.22,
          shadowRadius: 8,
        },
        default: { elevation: 3 },
      }),
    },
    chipDanger: {
      backgroundColor: themeDangerLight,
      borderColor: 'rgba(252, 107, 107, 0.35)',
    },
    chipWarning: {
      backgroundColor: themeWarningLight,
      borderColor: 'rgba(255, 184, 112, 0.35)',
    },
    chipAccent: {
      backgroundColor: themePrimaryLight,
      borderColor: 'rgba(55, 138, 221, 0.35)',
    },
    chipTextDefault: {
      fontSize: TYPE.caption,
      color: textSub,
      fontWeight: '600',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    chipTextDanger: {
      fontSize: TYPE.caption,
      color: themeDanger,
      fontWeight: '600',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    chipTextWarning: {
      fontSize: TYPE.caption,
      color: themeWarning,
      fontWeight: '600',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    chipTextAccent: {
      fontSize: TYPE.caption,
      color: themePrimary,
      fontWeight: '600',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    summaryCaption: {
      marginTop: SPACING.sm + 6,
      fontSize: TYPE.caption,
      color: textMut,
      fontWeight: '500',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_400Regular' as const } : {}),
    },
    summaryDivider: {
      height: 1,
      backgroundColor: g.glassBorder,
      opacity: 0.65,
      marginTop: SPACING.sm + 4,
      marginBottom: SPACING.xs,
    },
    tabBarBlurWrap: {
      paddingHorizontal: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    tabBarShell: {
      borderRadius: RADIUS.sheet,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: g.glassBorder,
      position: 'relative',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.45,
          shadowRadius: 28,
        },
        default: { elevation: 18 },
      }),
    },
    tabBarGlassUnderlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: g.glassBg,
      borderRadius: RADIUS.sheet,
      zIndex: 0,
    },
    tabBarBlur: {
      flexDirection: 'row',
      minHeight: 56,
      paddingBottom: 4,
      position: 'relative',
      backgroundColor: 'transparent',
      zIndex: 1,
    },
    tabBarDepth: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
      opacity: 0.95,
    },
    tabBarShimmer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      zIndex: 3,
    },
    tabBarInsetBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 1,
      zIndex: 3,
      opacity: 0.35,
    },
    tabItem: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.xs,
    },
    tabTextActive: {
      fontSize: TYPE.caption + 2,
      letterSpacing: -0.02 * (TYPE.caption + 2),
      color: themePrimary,
      fontWeight: '700',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
      ...Platform.select({
        ios: {
          textShadowColor: g.accentGlow,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 14,
        },
        default: {},
      }),
    },
    tabTextInactive: {
      fontSize: TYPE.caption + 1,
      letterSpacing: -0.016 * (TYPE.caption + 1),
      color: textMut,
      fontWeight: '600',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_500Medium' as const } : {}),
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 6,
      height: 5,
      borderRadius: 5,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: themePrimary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.95,
          shadowRadius: 14,
        },
        default: {
          elevation: 8,
        },
      }),
    },
    tabIndicatorGradientFill: {
      ...StyleSheet.absoluteFillObject,
    },
    tabIndicatorTopShine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      zIndex: 2,
    },
    tabIndicatorThird: {
      width: '33.333333%',
    },
    content: {
      flex: 1,
    },
    flashListContent: {
      paddingTop: SPACING.sm + 6,
      paddingBottom: SPACING.xxxl + SPACING.xl + 8,
    },
    cardWrapper: {
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.sm + 2,
      borderRadius: RADIUS.card,
      overflow: 'hidden',
    },
    cardBlur: {
      position: 'relative',
      borderRadius: RADIUS.card,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: g.glassBorder,
      ...glassShadow,
    },
    cardTopShine: {
      position: 'absolute',
      top: 0,
      left: 12,
      right: 12,
      height: 2,
      borderBottomLeftRadius: 2,
      borderBottomRightRadius: 2,
      zIndex: 4,
      opacity: 0.9,
    },
    cardInnerZebraA: {
      paddingVertical: SPACING.md + 2,
      paddingHorizontal: SPACING.md,
      backgroundColor: g.zebraA,
    },
    cardInnerZebraB: {
      paddingVertical: SPACING.md + 2,
      paddingHorizontal: SPACING.md,
      backgroundColor: g.zebraB,
    },
    cardBottomFrost: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 48,
      zIndex: 3,
      opacity: 0.55,
      pointerEvents: 'none',
    },
    cardInnerRelative: {
      position: 'relative',
    },
    cardBody: {
      position: 'relative',
      zIndex: 2,
    },
    cardExpiringCritical: {
      borderLeftWidth: 4,
      borderLeftColor: themeDanger,
    },
    cardExpiringWarn: {
      borderLeftWidth: 4,
      borderLeftColor: themeWarning,
    },
    cardExpiringAmber: {
      borderLeftWidth: 4,
      borderLeftColor: '#EAB308',
    },
    cardExpiringSafe: {
      borderLeftWidth: 4,
      borderLeftColor: themeSuccess,
    },
    h1Badge: {
      position: 'absolute',
      top: 0,
      left: 0,
      paddingHorizontal: SPACING.sm - 2,
      paddingVertical: SPACING.xs - 1,
      borderTopLeftRadius: RADIUS.card,
      borderBottomRightRadius: RADIUS.chip + 2,
      zIndex: 3,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      backgroundColor: 'rgba(229, 62, 62, 0.85)',
    },
    h1Text: {
      color: g.textPrimary,
      fontSize: TYPE.micro,
      fontWeight: '700',
      letterSpacing: 0.06 * TYPE.micro,
    },
    cardContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.sm + 4,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: g.glassBorder,
      backgroundColor: g.surface1,
    },
    iconCircleGradient: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 24,
    },
    iconGlyph: {
      zIndex: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardCenter: {
      flex: 1,
    },
    medName: {
      fontSize: TYPE.body + 1,
      marginBottom: SPACING.xs - 1,
      color: textMain,
      fontWeight: '600',
      letterSpacing: -0.022 * (TYPE.body + 1),
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    medGeneric: {
      fontSize: TYPE.caption,
      marginBottom: SPACING.xs - 1,
      color: textSub,
      fontWeight: '500',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_500Medium' as const } : {}),
    },
    medMfg: {
      fontSize: TYPE.micro + 1,
      color: textMut,
      fontWeight: '500',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_400Regular' as const } : {}),
    },
    cardRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    stockValue: {
      fontSize: TYPE.lead,
      fontWeight: '700',
      letterSpacing: -0.03 * TYPE.lead,
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    stockDanger: { color: themeDanger },
    stockWarning: { color: themeWarning },
    stockPrimary: { color: themePrimary },
    stockUnits: {
      fontSize: TYPE.micro,
      color: textSub,
      fontWeight: '600',
      letterSpacing: 0.04 * TYPE.micro,
      textTransform: 'uppercase',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_500Medium' as const } : {}),
    },
    categoryBadge: {
      borderWidth: 1,
      borderColor: g.glassBorder,
      paddingHorizontal: SPACING.sm - 4,
      paddingVertical: SPACING.xs - 1,
      borderRadius: SPACING.sm,
      marginTop: SPACING.xs,
      backgroundColor: g.surface1,
    },
    categoryBadgeText: {
      fontSize: TYPE.micro,
      color: textSub,
      fontWeight: '700',
      letterSpacing: 0.06 * TYPE.micro,
      textTransform: 'uppercase',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    shortbookBtn: {
      marginTop: SPACING.sm + 6,
      minHeight: 40,
      borderRadius: RADIUS.control,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: themePrimary,
      backgroundColor: themePrimaryLight,
      ...Platform.select({
        ios: {
          shadowColor: themePrimary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 12,
        },
        default: { elevation: 4 },
      }),
    },
    shortbookBtnText: {
      color: themePrimary,
      fontWeight: '700',
      fontSize: TYPE.caption,
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    expRowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    expBatch: {
      color: textMain,
      fontWeight: '600',
      fontSize: TYPE.body + 1,
      letterSpacing: -0.02 * (TYPE.body + 1),
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    expDaysDanger: {
      color: themeDanger,
      fontWeight: '700',
      fontSize: TYPE.caption,
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    expDaysWarning: {
      color: themeWarning,
      fontWeight: '700',
      fontSize: TYPE.caption,
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    expDaysAmber: {
      color: '#EAB308',
      fontWeight: '700',
      fontSize: TYPE.caption,
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    expDaysOk: {
      color: themeSuccess,
      fontWeight: '700',
      fontSize: TYPE.caption,
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_600SemiBold' as const } : {}),
    },
    expRowBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    expMeta: {
      color: textSub,
      fontSize: TYPE.caption,
      fontWeight: '500',
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_500Medium' as const } : {}),
    },
    listEmptyWrap: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.xxl + SPACING.md,
      minHeight: 280,
    },
    listEmptyGlass: {
      width: '100%',
      maxWidth: 340,
      borderRadius: RADIUS.card + 4,
      borderWidth: 1,
      borderColor: g.glassBorder,
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      backgroundColor: g.surface2,
      ...glassShadow,
    },
    listEmptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: g.glassBorder,
      overflow: 'hidden',
      position: 'relative',
    },
    listEmptyIconGlyph: {
      zIndex: 2,
      position: 'relative',
    },
    listEmptyTitle: {
      fontSize: TYPE.titleSm,
      color: textMain,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: -0.03 * TYPE.titleSm,
      marginBottom: SPACING.sm,
      ...(fontsReady ? { fontFamily: 'Syne_600SemiBold' as const } : {}),
    },
    listEmptySubtitle: {
      fontSize: TYPE.caption + 1,
      color: textMut,
      textAlign: 'center',
      lineHeight: Math.round((TYPE.caption + 1) * 1.45),
      ...(fontsReady ? { fontFamily: 'PlusJakartaSans_500Medium' as const } : {}),
    },
    fab: {
      position: 'absolute',
      bottom: SPACING.lg + 4,
      right: SPACING.lg,
      width: 58,
      height: 58,
      borderRadius: 29,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      ...fabGlow,
    },
    fabGradient: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    fabInnerGlow: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 29,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
    },
  });
}

export default function InventoryIndexScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [fontsLoaded] = useFonts({
    Syne_700Bold,
    Syne_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
  });

  const glass = useMemo(() => mergeGlass(theme.colors, isDark), [theme.colors, isDark]);

  const styles = useMemo(
    () =>
      createStyles(
        glass,
        theme.colors.primary,
        theme.colors.primaryLight,
        theme.colors.danger,
        theme.colors.dangerLight,
        theme.colors.warning,
        theme.colors.warningLight,
        theme.colors.success,
        insets.top,
        !!fontsLoaded
      ),
    [
      glass,
      theme.colors.primary,
      theme.colors.primaryLight,
      theme.colors.danger,
      theme.colors.dangerLight,
      theme.colors.warning,
      theme.colors.warningLight,
      theme.colors.success,
      insets.top,
      fontsLoaded,
    ]
  );

  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: medicinesData, isLoading: isLoadingAll } = useMedicines({ q: debouncedSearch });
  const { data: lowStockData, isLoading: isLoadingLow } = useLowStock();
  const { data: expiringData, isLoading: isLoadingExpiring } = useExpiringBatches(90);
  const { data: summaryData } = useStockSummary();

  const addToShortbook = useAddToShortbook();

  const listEmpty = (isLoading: boolean, tab: 0 | 1 | 2) => {
    if (isLoading) {
      return (
        <View style={styles.listEmptyWrap}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }
    const copy: Record<0 | 1 | 2, { title: string; sub: string; icon: keyof typeof Ionicons.glyphMap }> = {
      0: {
        title: 'No medicines found',
        sub: 'Try another search, or add a new product to your catalog.',
        icon: 'search-outline',
      },
      1: {
        title: 'No low stock items',
        sub: 'Inventory is healthy — nothing is below reorder level right now.',
        icon: 'checkmark-done-outline',
      },
      2: {
        title: 'No expiring batches',
        sub: 'Nothing in the next 90 days needs attention. You are all set.',
        icon: 'shield-checkmark-outline',
      },
    };
    const c = copy[tab];
    return (
      <View style={styles.listEmptyWrap}>
        <View style={styles.listEmptyGlass}>
          <View style={styles.listEmptyIconCircle}>
            <LinearGradient
              colors={[glass.iconGradientA, glass.surface1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Ionicons name={c.icon} size={30} color={glass.textPrimary} style={styles.listEmptyIconGlyph} />
          </View>
          <Text style={styles.listEmptyTitle}>{c.title}</Text>
          <Text style={styles.listEmptySubtitle}>{c.sub}</Text>
        </View>
      </View>
    );
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  };

  const indicatorPosition = useSharedValue(0);

  const handleTabPress = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(index);
    indicatorPosition.value = withTiming(index, { duration: 200 });
  };

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: (indicatorPosition.value * 100 + '%') as any }],
      left: `${(100 / TABS.length) / 2}%`,
      marginLeft: '-5%',
    };
  });

  const handleMedicinePress = (id: string) => {
    router.push(`/(app)/inventory/${id}`);
  };

  const getCategoryIcon = (category: string) => {
    const map: Record<string, any> = {
      Tablet: 'medical-outline',
      Capsule: 'medical-outline',
      Syrup: 'water-outline',
      Drops: 'water-outline',
      Injection: 'flask-outline',
      Cream: 'leaf-outline',
    };
    return map[category] || 'cube-outline';
  };

  type StockTone = 'stockDanger' | 'stockWarning' | 'stockPrimary';

  const stockVariant = (item: Medicine): StockTone => {
    const isOutOfStock = (item.total_stock ?? 0) === 0;
    const isLow = !isOutOfStock && (item.total_stock ?? 0) <= (item.reorderLevel ?? 10);
    if (isOutOfStock) return 'stockDanger';
    if (isLow) return 'stockWarning';
    return 'stockPrimary';
  };

  const renderMedicineCard = (item: Medicine, isLowStockTab: boolean, index: number) => {
    const variant = stockVariant(item);
    const zebra = index % 2 === 0;

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 50).duration(350)}>
        <TouchableOpacity
          activeOpacity={0.92}
          style={styles.cardWrapper}
          onPress={() => handleMedicinePress(item.id)}
        >
          <BlurView intensity={blurIntensity('card')} tint={isDark ? 'dark' : 'light'} style={styles.cardBlur}>
            <LinearGradient
              colors={[glass.glassShine, 'rgba(255,255,255,0.02)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.cardTopShine}
              pointerEvents="none"
            />
            <View style={[zebra ? styles.cardInnerZebraA : styles.cardInnerZebraB, styles.cardInnerRelative]}>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.28)']}
                style={styles.cardBottomFrost}
                pointerEvents="none"
              />
              <View style={styles.cardBody}>
                {item.schedule === 'H1' && (
                  <View style={styles.h1Badge}>
                    <Text style={styles.h1Text}>H1</Text>
                  </View>
                )}

                <View style={styles.cardContent}>
                  <View style={styles.iconCircle}>
                    <LinearGradient
                      colors={[glass.iconGradientA, glass.iconGradientB]}
                      start={{ x: 0.15, y: 0 }}
                      end={{ x: 0.85, y: 1 }}
                      style={styles.iconCircleGradient}
                    />
                    <View style={styles.iconGlyph}>
                      <Ionicons name={getCategoryIcon(item.category)} size={22} color={theme.colors.primary} />
                    </View>
                  </View>

                  <View style={styles.cardCenter}>
                    <Text style={styles.medName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.medGeneric} numberOfLines={1}>
                      {item.genericName}
                    </Text>
                    <Text style={styles.medMfg} numberOfLines={1}>
                      {item.manufacturer}
                    </Text>
                  </View>

                  <View style={styles.cardRight}>
                    <Text style={[styles.stockValue, styles[variant]]}>{item.total_stock ?? 0}</Text>
                    <Text style={styles.stockUnits}>units</Text>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{item.category}</Text>
                    </View>
                  </View>
                </View>

                {isLowStockTab && (
                  <TouchableOpacity
                    style={styles.shortbookBtn}
                    onPress={() => addToShortbook.mutate(item.id)}
                    disabled={addToShortbook.isPending}
                    activeOpacity={0.88}
                  >
                    {addToShortbook.isPending ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Text style={styles.shortbookBtnText}>Add to Shortbook</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </BlurView>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  type ExpDaysTone = 'expDaysDanger' | 'expDaysWarning' | 'expDaysAmber' | 'expDaysOk';

  const expDaysStyle = (days: number): ExpDaysTone => {
    if (days < 30) return 'expDaysDanger';
    if (days < 60) return 'expDaysWarning';
    if (days < 90) return 'expDaysAmber';
    return 'expDaysOk';
  };

  type ExpBorderTone = 'cardExpiringCritical' | 'cardExpiringWarn' | 'cardExpiringAmber' | 'cardExpiringSafe';

  const expBorderStyle = (days: number): ExpBorderTone => {
    if (days < 30) return 'cardExpiringCritical';
    if (days < 60) return 'cardExpiringWarn';
    if (days < 90) return 'cardExpiringAmber';
    return 'cardExpiringSafe';
  };

  const renderExpiringCard = (batch: MedicineBatch & { name?: string }, index: number) => {
    const days = Math.floor((new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const daysKey = expDaysStyle(days);
    const borderKey = expBorderStyle(days);
    const zebra = index % 2 === 0;

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 50).duration(350)}>
        <TouchableOpacity
          activeOpacity={0.92}
          style={styles.cardWrapper}
          onPress={() => handleMedicinePress(batch.medicineId)}
        >
          <BlurView intensity={blurIntensity('card')} tint={isDark ? 'dark' : 'light'} style={styles.cardBlur}>
            <LinearGradient
              colors={[glass.glassShine, 'rgba(255,255,255,0.02)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.cardTopShine}
              pointerEvents="none"
            />
            <View style={[zebra ? styles.cardInnerZebraA : styles.cardInnerZebraB, styles.cardInnerRelative, styles[borderKey]]}>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.28)']}
                style={styles.cardBottomFrost}
                pointerEvents="none"
              />
              <View style={styles.cardBody}>
                <View style={styles.expRowTop}>
                  <Text style={styles.expBatch}>{batch.batchNumber}</Text>
                  <Text style={styles[daysKey]}>{days < 0 ? 'Expired' : `in ${days} days`}</Text>
                </View>
                <View style={styles.expRowBottom}>
                  <Text style={styles.expMeta}>Expires: {formatDate(batch.expiryDate)}</Text>
                  <Text style={styles.expMeta}>Qty: {batch.quantity}</Text>
                </View>
              </View>
            </View>
          </BlurView>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.meshFill} pointerEvents="none">
        <View style={styles.meshOrb1} />
        <View style={styles.meshOrb2} />
        <View style={styles.meshOrb3} />
        <View style={styles.meshOrbAccent} />
        <View style={styles.noiseOverlay} />
        <LinearGradient
          colors={[glass.vignetteTop, glass.vignetteMid, glass.vignetteBottom]}
          locations={[0, 0.45, 1]}
          style={styles.meshVignette}
          pointerEvents="none"
        />
      </View>

      <View style={styles.headerBlurWrap}>
        <LinearGradient
          colors={
            isDark
              ? (['rgba(8,11,20,0.94)', 'rgba(8,11,20,0.72)', 'rgba(8,11,20,0.28)'] as const)
              : (['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)'] as const)
          }
          locations={[0, 0.45, 1]}
          style={styles.headerScrim}
          pointerEvents="none"
        />
        <BlurView intensity={blurIntensity('hero')} tint={isDark ? 'dark' : 'light'} style={styles.headerBlur}>
          <LinearGradient
            colors={[glass.glassShine, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerShimmer}
          />
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <LinearGradient
                colors={[glass.accentPrimary, theme.colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.titleAccentRail}
              />
              <View style={styles.titleWrap}>
                <Text style={styles.title}>Inventory</Text>
                <Text style={styles.titleSubtitle}>Browse stock, batches, and schedules in one place.</Text>
              </View>
            </View>
          </View>

          <View style={styles.searchRowWrap}>
            <LinearGradient
              colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.searchInnerShine}
              pointerEvents="none"
            />
            <View style={styles.searchRow}>
              <View style={styles.searchIconWrap}>
                <Ionicons name="search-outline" size={22} color={glass.textSecondary} />
              </View>
              <View style={styles.searchDivider} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search medicines..."
                placeholderTextColor={glass.textMuted}
                value={search}
                onChangeText={handleSearch}
              />
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.chipRow}>
              <View style={styles.chipGlass}>
                <Text style={styles.chipTextDefault}>All</Text>
              </View>
              <View style={[styles.chipGlass, styles.chipDanger]}>
                <Text style={styles.chipTextDanger}>Low Stock</Text>
              </View>
              <View style={[styles.chipGlass, styles.chipWarning]}>
                <Text style={styles.chipTextWarning}>Expiring</Text>
              </View>
              <View style={[styles.chipGlass, styles.chipAccent]}>
                <Text style={styles.chipTextAccent}>Schedule H1</Text>
              </View>
            </View>
            {summaryData ? (
              <>
                <View style={styles.summaryDivider} />
                <Text style={styles.summaryCaption}>
                  {summaryData.totalProducts} medicines · {formatCurrency(summaryData.totalStockValue)}
                </Text>
              </>
            ) : null}
          </View>
        </BlurView>
      </View>

      <View style={styles.tabBarBlurWrap}>
        <View style={styles.tabBarShell}>
          <View style={styles.tabBarGlassUnderlay} pointerEvents="none" />
          <BlurView intensity={blurIntensity('tab')} tint={isDark ? 'dark' : 'light'} style={styles.tabBarBlur}>
            <LinearGradient
              colors={[glass.surface3, glass.surface1, 'transparent']}
              locations={[0, 0.35, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.tabBarDepth}
              pointerEvents="none"
            />
            <LinearGradient
              colors={[glass.insetShine, glass.glassShine, 'transparent']}
              locations={[0, 0.4, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tabBarShimmer}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.22)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.tabBarInsetBottom}
              pointerEvents="none"
            />
            {TABS.map((tab, idx) => (
              <TouchableOpacity key={tab} onPress={() => handleTabPress(idx)} style={styles.tabItem} activeOpacity={0.85}>
                <Text style={activeTab === idx ? styles.tabTextActive : styles.tabTextInactive}>{tab}</Text>
              </TouchableOpacity>
            ))}
            <Animated.View style={[styles.tabIndicator, styles.tabIndicatorThird, indicatorStyle]}>
              <LinearGradient
                colors={[theme.colors.primary, glass.accentPrimary, theme.colors.primary]}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.tabIndicatorGradientFill}
              />
              <LinearGradient
                colors={[glass.insetShine, 'rgba(255,255,255,0.04)', 'transparent']}
                style={styles.tabIndicatorTopShine}
                pointerEvents="none"
              />
            </Animated.View>
          </BlurView>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === 0 && (
          <FlashListAny
            data={medicinesData || []}
            keyExtractor={(item: any) => item.id}
            estimatedItemSize={96}
            renderItem={({ item, index = 0 }: { item: Medicine; index?: number }) => renderMedicineCard(item, false, index)}
            contentContainerStyle={styles.flashListContent}
            ListEmptyComponent={() => listEmpty(isLoadingAll, 0)}
          />
        )}

        {activeTab === 1 && (
          <FlashListAny
            data={lowStockData || []}
            keyExtractor={(item: any) => item.id}
            estimatedItemSize={132}
            renderItem={({ item, index = 0 }: { item: Medicine; index?: number }) => renderMedicineCard(item, true, index)}
            contentContainerStyle={styles.flashListContent}
            ListEmptyComponent={() => listEmpty(isLoadingLow, 1)}
          />
        )}

        {activeTab === 2 && (
          <FlashListAny
            data={expiringData || []}
            keyExtractor={(item: any) => item.id}
            estimatedItemSize={84}
            renderItem={({ item, index = 0 }: { item: MedicineBatch; index?: number }) => renderExpiringCard(item, index)}
            contentContainerStyle={styles.flashListContent}
            ListEmptyComponent={() => listEmpty(isLoadingExpiring, 2)}
          />
        )}
      </View>

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/(app)/inventory/add')} activeOpacity={0.92}>
        <LinearGradient
          colors={[theme.colors.primary, glass.accentPrimary]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.fabGradient}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.45 }}
            style={styles.fabInnerGlow}
            pointerEvents="none"
          />
          <Ionicons name="add-outline" size={28} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
