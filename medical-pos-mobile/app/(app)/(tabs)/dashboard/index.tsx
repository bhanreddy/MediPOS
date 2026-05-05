import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  StatusBar,
  Platform,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { Canvas, Path, LinearGradient as SkiaLinearGradient, vec, Circle } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';
import { useDashboardData } from '@/hooks/useDashboard';
import { useRevenueTrend } from '@/hooks/useAnalytics';
import { formatCurrency, formatRelative, getInitials } from '@/utils/format';
import type { RevenueTrendPoint } from '@/api/analytics';
import { runSyncCycle } from '@/sync/syncEngine';
import { useTheme } from '@/hooks/useTheme';

/* ═══════════════════════════════════════════════════════
   DESIGN TOKENS — light / dark
   ═══════════════════════════════════════════════════════ */

interface DashboardTokens {
  isDark: boolean;
  bg: string;
  bgMesh: readonly [string, string, string, string];
  bgCard: string;
  bgGlass: string;
  bgGlassBorder: string;
  blue: string;
  blueLight: string;
  blueMid: string;
  blueGlow: string;
  green: string;
  greenLight: string;
  amber: string;
  amberLight: string;
  red: string;
  redLight: string;
  purple: string;
  purpleLight: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  fontDisplay: string;
  fontMono: string;
  fontSans: string;
  px: number;
  radius: { xs: number; sm: number; md: number; lg: number; xl: number; pill: number };
  shadowBlue: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  shadowCard: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  blurTint: 'dark' | 'light';
  blurIntensity: number;
  glassAndroidSolid: string;
  glassIosDim: string;
  glassSheen: readonly [string, string, string];
  glowBlue: string;
  glowPurple: string;
  glowTeal: string;
  dateChipBg: string;
  headerBtnBg: string;
  refLineColor: string;
  pillRowBg: string;
  pillRowBorder: string;
  statStripBg: string;
  skeletonBg: string;
  fabBorder: string;
  avatarBorder: string;
  kpiCardBorder: string;
}

const fontDisplay = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const fontMono = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const fontSans = Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif';
const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 100 } as const;
const px = 24;

function buildTokens(isDark: boolean): DashboardTokens {
  const brand = {
    blue: '#3B7BF8',
    blueMid: 'rgba(59,123,248,0.28)',
    green: '#22C55E',
    amber: '#F59E0B',
    red: '#EF4444',
    purple: '#A78BFA',
  };

  if (isDark) {
    return {
      isDark: true,
      bg: '#0A0D14',
      bgMesh: ['#06080F', '#0A0D14', '#080B12', '#0A1622'],
      bgCard: '#111520',
      bgGlass: 'rgba(255,255,255,0.04)',
      bgGlassBorder: 'rgba(255,255,255,0.08)',
      ...brand,
      blueLight: 'rgba(59,123,248,0.14)',
      blueGlow: 'rgba(59,123,248,0.35)',
      greenLight: 'rgba(34,197,94,0.14)',
      amberLight: 'rgba(245,158,11,0.14)',
      redLight: 'rgba(239,68,68,0.14)',
      purpleLight: 'rgba(167,139,250,0.14)',
      textPrimary: '#F0F4FF',
      textSecondary: '#7A8BAA',
      textTertiary: '#3D4A62',
      fontDisplay,
      fontMono,
      fontSans,
      px,
      radius,
      shadowBlue: {
        shadowColor: '#3B7BF8',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 12,
      },
      shadowCard: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 8,
      },
      blurTint: 'dark',
      blurIntensity: 52,
      glassAndroidSolid: 'rgba(14,17,26,0.94)',
      glassIosDim: 'rgba(14,17,26,0.45)',
      glassSheen: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.02)'],
      glowBlue: 'rgba(59,123,248,0.09)',
      glowPurple: 'rgba(167,139,250,0.07)',
      glowTeal: 'rgba(45,212,191,0.06)',
      dateChipBg: 'rgba(255,255,255,0.05)',
      headerBtnBg: 'rgba(255,255,255,0.06)',
      refLineColor: 'rgba(255,255,255,0.04)',
      pillRowBg: 'rgba(0,0,0,0.35)',
      pillRowBorder: 'rgba(255,255,255,0.06)',
      statStripBg: 'rgba(255,255,255,0.04)',
      skeletonBg: 'rgba(255,255,255,0.12)',
      fabBorder: 'rgba(255,255,255,0.25)',
      avatarBorder: 'rgba(255,255,255,0.28)',
      kpiCardBorder: 'rgba(255,255,255,0.12)',
    };
  }

  return {
    isDark: false,
    bg: '#F0F3F9',
    bgMesh: ['#FFFFFF', '#F0F3F9', '#E8EEF6', '#F5F8FC'],
    bgCard: '#FFFFFF',
    bgGlass: 'rgba(0,0,0,0.04)',
    bgGlassBorder: 'rgba(0,0,0,0.08)',
    ...brand,
    blueLight: 'rgba(59,123,248,0.12)',
    blueGlow: 'rgba(59,123,248,0.22)',
    greenLight: 'rgba(34,197,94,0.12)',
    amberLight: 'rgba(245,158,11,0.12)',
    redLight: 'rgba(239,68,68,0.1)',
    purpleLight: 'rgba(124,58,237,0.1)',
    textPrimary: '#0C1222',
    textSecondary: '#5C6B84',
    textTertiary: '#8B98AD',
    fontDisplay,
    fontMono,
    fontSans,
    px,
    radius,
    shadowBlue: {
      shadowColor: '#3B7BF8',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
      elevation: 6,
    },
    shadowCard: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 3,
    },
    blurTint: 'light',
    blurIntensity: 78,
    glassAndroidSolid: 'rgba(255,255,255,0.96)',
    glassIosDim: 'rgba(255,255,255,0.65)',
    glassSheen: ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.03)'],
    glowBlue: 'rgba(59,123,248,0.14)',
    glowPurple: 'rgba(167,139,250,0.12)',
    glowTeal: 'rgba(45,212,191,0.1)',
    dateChipBg: 'rgba(0,0,0,0.04)',
    headerBtnBg: 'rgba(0,0,0,0.05)',
    refLineColor: 'rgba(0,0,0,0.06)',
    pillRowBg: 'rgba(0,0,0,0.06)',
    pillRowBorder: 'rgba(0,0,0,0.08)',
    statStripBg: 'rgba(255,255,255,0.9)',
    skeletonBg: '#E2E8F0',
    fabBorder: 'rgba(255,255,255,0.65)',
    avatarBorder: 'rgba(0,0,0,0.1)',
    kpiCardBorder: 'rgba(0,0,0,0.08)',
  };
}

type DashCtxValue = { d: DashboardTokens; styles: ReturnType<typeof StyleSheet.create> };
const DashCtx = React.createContext<DashCtxValue | null>(null);

function useDash(): DashCtxValue {
  const v = React.useContext(DashCtx);
  if (!v) throw new Error('useDash must be used within DashboardScreen');
  return v;
}

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */

type ChartPeriod = '7D' | '30D' | '90D';

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */

function getGreetingPrefix(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function periodToQuery(p: ChartPeriod): { period: string; range: string } {
  switch (p) {
    case '7D': return { period: 'daily', range: '7' };
    case '30D': return { period: 'daily', range: '30' };
    case '90D': return { period: 'monthly', range: '90' };
  }
}

function buildAreaPath(points: { x: number; y: number }[], width: number, height: number): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + (curr.x - prev.x) / 3;
    const cpx2 = prev.x + (2 * (curr.x - prev.x)) / 3;
    d += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  d += ` L ${width} ${height} L 0 ${height} Z`;
  return d;
}

function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + (curr.x - prev.x) / 3;
    const cpx2 = prev.x + (2 * (curr.x - prev.x)) / 3;
    d += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

/* ═══════════════════════════════════════════════════════
   GLASS CARD BASE
   ═══════════════════════════════════════════════════════ */

function GlassCard({
  children,
  style,
  noBorder = false,
}: {
  children: React.ReactNode;
  style?: any;
  noBorder?: boolean;
}) {
  const { d } = useDash();
  return (
    <View
      style={[
        {
          borderRadius: d.radius.lg,
          borderWidth: noBorder ? 0 : 1,
          borderColor: d.bgGlassBorder,
          overflow: 'hidden',
          backgroundColor: Platform.OS === 'android' ? d.glassAndroidSolid : d.glassIosDim,
        },
        d.shadowCard,
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={d.blurIntensity} tint={d.blurTint} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: d.glassAndroidSolid }]} />
      )}
      <LinearGradient
        colors={[...d.glassSheen]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />
      <View style={{ position: 'relative', zIndex: 1 }}>{children}</View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   SKELETON SHIMMER — PREMIUM
   ═══════════════════════════════════════════════════════ */

function SkeletonRect({
  width,
  height,
  borderRadius = 8,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
}) {
  const { d } = useDash();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [shimmer]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.08, 0.18]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: d.skeletonBg,
        },
        animStyle,
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   KPI CARD — PREMIUM
   Each card has a unique gradient personality
   ═══════════════════════════════════════════════════════ */

interface KpiCardConfig {
  icon: keyof typeof Ionicons.glyphMap;
  gradientColors: readonly [string, string, ...string[]];
  value: string;
  label: string;
  sub?: string;
  subIcon?: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  index: number;
}

function KpiCard({ icon, gradientColors, value, label, sub, subIcon, accentColor, index }: KpiCardConfig) {
  const { d, styles } = useDash();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={{ marginRight: 14 }}
      entering={FadeInRight.delay(index * 80).springify().damping(18)}
    >
      <Animated.View style={animStyle}>
        <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 15 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15 });
        }}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.kpiCard, d.shadowCard]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)', 'transparent']}
            locations={[0, 0.22, 0.55]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 0.55 }}
            style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.22)']}
            start={{ x: 0.5, y: 0.4 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
          />
          {/* Top row: icon + sub badge */}
          <View style={styles.kpiTopRow}>
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <Ionicons name={icon} size={18} color="#FFFFFF" />
            </View>
            {sub ? (
              <View style={styles.kpiBadge}>
                {subIcon && <Ionicons name={subIcon} size={10} color={accentColor} style={{ marginRight: 2 }} />}
                <Text style={[styles.kpiBadgeText, { color: accentColor }]}>{sub}</Text>
              </View>
            ) : null}
          </View>

          {/* Value */}
          <Text
            style={styles.kpiValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            {...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums' as const] } : {})}
          >
            {value}
          </Text>

          {/* Label */}
          <Text style={styles.kpiLabel}>{label}</Text>

          {/* Decorative ring */}
          <View style={styles.kpiDecorRing} />
        </LinearGradient>
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════
   ALERT CHIP — PREMIUM
   ═══════════════════════════════════════════════════════ */

function AlertChip({
  label,
  bgColor,
  borderColor,
  textColor,
  dotColor,
  onPress,
}: {
  label: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  dotColor: string;
  onPress: () => void;
}) {
  const { styles } = useDash();
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.chip, { backgroundColor: bgColor, borderColor }]}
    >
      <Animated.View style={[styles.chipDot, { backgroundColor: dotColor }, dotStyle]} />
      <Text style={[styles.chipText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

/* ═══════════════════════════════════════════════════════
   PERIOD PILL — PREMIUM
   ═══════════════════════════════════════════════════════ */

function PeriodPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { styles } = useDash();
  const glow = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    glow.value = withTiming(selected ? 1 : 0, { duration: 200 });
  }, [selected, glow]);

  const animStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(glow.value, [0, 1], [0, 0.55]),
  }));

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <Animated.View
        style={[
          styles.pill,
          selected ? styles.pillSelected : styles.pillUnselected,
          animStyle,
        ]}
      >
        <Text style={[styles.pillText, selected ? styles.pillTextSelected : styles.pillTextUnselected]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/* ═══════════════════════════════════════════════════════
   REVENUE CHART — PREMIUM
   ═══════════════════════════════════════════════════════ */

interface RevenueChartProps {
  data: RevenueTrendPoint[];
  chartWidth: number;
}

function RevenueChart({ data, chartWidth }: RevenueChartProps) {
  const { d, styles } = useDash();
  const CHART_H = 180;
  const PAD_V = 20;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [data, progress]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [12, 0]) }],
  }));

  if (data.length === 0) {
    return (
      <View style={{ height: CHART_H, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="analytics-outline" size={32} color={d.textTertiary} />
        <Text style={[styles.emptyChartText]}>No data for this period</Text>
      </View>
    );
  }

  const revenues = data.map((row) => row.revenue);
  const maxRev = Math.max(...revenues, 1);
  const minRev = Math.min(...revenues, 0);
  const range = Math.max(maxRev - minRev, 1);

  const points = data.map((row, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * chartWidth,
    y: PAD_V + (1 - (row.revenue - minRev) / range) * (CHART_H - PAD_V * 2),
  }));

  const areaPath = buildAreaPath(points, chartWidth, CHART_H);
  const linePath = buildLinePath(points);

  // Identify peak point
  const maxIdx = revenues.indexOf(maxRev);
  const peakPoint = points[maxIdx];

  // X-axis labels (sparse)
  const labelIdxs = [0, Math.floor(data.length / 2), data.length - 1];

  // Delta
  const firstVal = revenues[0] ?? 0;
  const lastVal = revenues[revenues.length - 1] ?? 0;
  const delta = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
  const isUp = delta >= 0;

  return (
    <Animated.View style={animStyle}>
      {/* Delta badge */}
      <View style={styles.chartDeltaRow}>
        <Text style={styles.chartSumValue}>{formatCurrency(revenues.reduce((a, b) => a + b, 0))}</Text>
        <View style={[styles.deltaBadge, { backgroundColor: isUp ? d.greenLight : d.redLight }]}>
          <Ionicons name={isUp ? 'trending-up' : 'trending-down'} size={12} color={isUp ? d.green : d.red} />
          <Text style={[styles.deltaText, { color: isUp ? d.green : d.red }]}>
            {isUp ? '+' : ''}{delta.toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* Canvas */}
      <Canvas style={{ width: chartWidth, height: CHART_H }}>
        {/* Area gradient fill */}
        <Path path={areaPath}>
          <SkiaLinearGradient
            start={vec(0, 0)}
            end={vec(0, CHART_H)}
            colors={[`${d.blue}55`, `${d.blue}00`]}
          />
        </Path>
        {/* Line stroke */}
        <Path path={linePath} style="stroke" strokeWidth={2.5} color={d.blue} />
        {/* Peak circle outer */}
        {peakPoint && (
          <Circle cx={peakPoint.x} cy={peakPoint.y} r={7} color={`${d.blue}30`} />
        )}
        {/* Peak circle inner */}
        {peakPoint && (
          <Circle cx={peakPoint.x} cy={peakPoint.y} r={3.5} color={d.blue} />
        )}
        {/* Baseline dots */}
        {points.map((pt, i) => (
          <Circle key={i} cx={pt.x} cy={CHART_H - 1} r={1.5} color={`${d.blue}30`} />
        ))}
      </Canvas>

      {/* Dashed horizontal reference line at mid */}
      <View style={[styles.refLine, { top: CHART_H / 2 }]} />

      {/* X-axis labels */}
      <View style={styles.xAxisRow}>
        {labelIdxs.map((idx) => (
          <Text key={idx} style={styles.axisLabel}>
            {data[idx]?.date?.slice(5) ?? ''}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════
   STAT STRIP — replaces QuickStat row
   ═══════════════════════════════════════════════════════ */

function StatStrip({ label, value, color, icon, index }: {
  label: string;
  value: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  index: number;
}) {
  const { styles } = useDash();
  return (
    <Animated.View
      style={[styles.statStrip, { borderLeftColor: color }]}
      entering={FadeInDown.delay(index * 60).springify().damping(18)}
    >
      <Ionicons name={icon} size={13} color={color} style={{ marginBottom: 4 }} />
      <Text style={[styles.statStripValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statStripLabel}>{label}</Text>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════
   ACTIVITY ITEM — PREMIUM
   ═══════════════════════════════════════════════════════ */

interface ActivityItemData {
  id: string;
  invoice_number: string;
  customer_name: string;
  net_amount: number;
  date: string;
  payment_mode: string;
  is_return: boolean;
}

function ActivityItem({ item, index }: { item: ActivityItemData; index: number }) {
  const { d, styles } = useDash();
  const scale = useSharedValue(1);
  const isReturn = item.is_return;
  const color = isReturn ? d.red : d.green;
  const bgColor = isReturn ? d.redLight : d.greenLight;

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 40).springify().damping(20)}
    >
      <Animated.View style={animStyle}>
        <Pressable
        onPressIn={() => { scale.value = withSpring(0.985); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        <View style={styles.activityRow}>
          {/* Left accent line */}
          <View style={[styles.activityAccent, { backgroundColor: color }]} />

          {/* Icon */}
          <View style={[styles.activityIconWrap, { backgroundColor: bgColor }]}>
            <Ionicons
              name={isReturn ? 'return-down-back' : 'receipt-outline'}
              size={15}
              color={color}
            />
          </View>

          {/* Content */}
          <View style={styles.activityContent}>
            <View style={styles.activityTopRow}>
              <Text style={styles.activityInvoice} numberOfLines={1}>{item.invoice_number}</Text>
              <Text style={[styles.activityAmount, { color }]}>
                {isReturn ? '−' : '+'}{formatCurrency(Math.abs(item.net_amount))}
              </Text>
            </View>
            <View style={styles.activityBottomRow}>
              <Text style={styles.activityCustomer} numberOfLines={1}>{item.customer_name}</Text>
              <View style={styles.activityMeta}>
                {/* Payment mode pill */}
                <View style={[styles.modePill, { backgroundColor: d.bgGlass, borderColor: d.bgGlassBorder }]}>
                  <Text style={styles.modePillText}>{item.payment_mode}</Text>
                </View>
                <Text style={styles.activityTime}>{formatRelative(item.date)}</Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════
   EMPTY STATE — PREMIUM
   ═══════════════════════════════════════════════════════ */

function EmptyActivity() {
  const { d, styles } = useDash();
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [float]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }],
  }));

  return (
    <View style={styles.emptyContainer}>
      <Animated.View style={[styles.emptyOrb, animStyle]}>
        <LinearGradient colors={[d.blueLight, 'transparent']} style={styles.emptyOrbGrad}>
          <Ionicons name="receipt-outline" size={34} color={d.blue} />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.emptyTitle}>All clear</Text>
      <Text style={styles.emptySubtitle}>No transactions recorded today</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION HEADER
   ═══════════════════════════════════════════════════════ */

function SectionHeader({
  title,
  eyebrow,
  action,
  onAction,
}: {
  title: string;
  eyebrow?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { d, styles } = useDash();
  return (
    <View style={styles.sectionHeaderRow}>
      <View>
        {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} style={styles.sectionActionHit}>
          <Text style={styles.sectionAction}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={d.blue} style={{ marginTop: 1 }} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN SCREEN
   ═══════════════════════════════════════════════════════ */

export default function DashboardScreen() {
  const { isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);

  const d = useMemo(() => buildTokens(isDark), [isDark]);
  const styles = useMemo(() => createStyles(d), [d]);
  const dashCtx = useMemo(() => ({ d, styles }), [d, styles]);

  const onToggleTheme = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  }, [toggleTheme]);

  const { data: dashboard, isLoading, refetch: refetchDashboard, isRefetching: isRefetchingDashboard } =
    useDashboardData();

  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('7D');
  const { period, range } = periodToQuery(chartPeriod);
  const {
    data: trendData,
    isLoading: isTrendLoading,
    refetch: refetchTrend,
    isRefetching: isRefetchingTrend,
  } = useRevenueTrend(period, range);

  // FAB entry
  const fabScale = useSharedValue(0);
  const fabRotate = useSharedValue(0);
  useEffect(() => {
    fabScale.value = withDelay(400, withSpring(1, { damping: 10, stiffness: 100 }));
  }, [fabScale]);
  const fabAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fabScale.value },
      { rotate: `${interpolate(fabScale.value, [0, 1], [-30, 0])}deg` },
    ],
  }));

  // Derived
  const firstName = user?.name?.split(' ')[0] ?? 'User';
  const initials = getInitials(user?.name ?? 'U');
  const greeting = getGreetingPrefix();
  const alertCount = useMemo(() => {
    if (!dashboard) return 0;
    return (
      (dashboard.low_stock_count ?? 0) +
      (dashboard.expiry_count_30d ?? 0) +
      (dashboard.shortbook_count ?? 0)
    );
  }, [dashboard]);
  const hasAlerts = alertCount > 0;

  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await runSyncCycle();
    } catch (e) {
      console.error('Manual sync from dashboard failed:', e);
    } finally {
      await Promise.all([refetchDashboard(), refetchTrend()]);
      setIsRefreshing(false);
    }
  }, [refetchDashboard, refetchTrend]);
  const refreshing = isRefreshing || isRefetchingDashboard || isRefetchingTrend;

  const chartWidth = screenWidth - 80;

  const avgBasket = useMemo(() => {
    if (!trendData || trendData.length === 0) return '—';
    const sum = trendData.reduce((acc, d) => acc + (d.avg_basket ?? 0), 0);
    return formatCurrency(sum / trendData.length);
  }, [trendData]);

  const trendDataArr = useMemo<RevenueTrendPoint[]>(() => trendData ?? [], [trendData]);

  const goToAlerts = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(app)/(tabs)/inventory' as never); }, []);
  const goToSettings = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(app)/(tabs)/inventory' as never); }, []);
  const goToPOS = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(app)/(tabs)/pos' as never); }, []);

  /* ─── Today's date string ───────────────────────────── */
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  /* ─── Render ────────────────────────────────────────── */

  return (
    <DashCtx.Provider value={dashCtx}>
    <View style={styles.root}>
      <StatusBar barStyle={d.isDark ? 'light-content' : 'dark-content'} backgroundColor={d.bg} />

      {/* Background gradient layer */}
      <LinearGradient
        colors={[...d.bgMesh]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Glow blobs — purely decorative */}
      <View style={[styles.glowBlob, styles.glowBlobBlue]} pointerEvents="none" />
      <View style={[styles.glowBlob, styles.glowBlobPurple]} pointerEvents="none" />
      <View style={[styles.glowBlob, styles.glowBlobTeal]} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: 110 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={d.blue}
            colors={[d.blue]}
            progressBackgroundColor={d.bgGlass}
          />
        }
      >
        {/* ══════════ HEADER ══════════ */}
        <Animated.View style={styles.headerRow} entering={FadeIn.duration(400)}>
          <View style={styles.headerLeft}>
            <View style={styles.headerMetaRow}>
              <View style={styles.dateChip}>
                <Ionicons name="calendar-outline" size={12} color={d.textSecondary} />
                <Text style={styles.dateChipText}>{todayStr}</Text>
              </View>
            </View>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <Text style={styles.headerGreeting}>
              {greeting},{' '}
              <Text style={styles.headerGreetingAccent}>{firstName}</Text>
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={onToggleTheme}
              style={styles.headerBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={d.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Ionicons
                name={d.isDark ? 'sunny-outline' : 'moon-outline'}
                size={20}
                color={d.textPrimary}
              />
            </Pressable>
            <Pressable
              onPress={goToAlerts}
              style={[styles.headerBtn, hasAlerts && styles.headerBtnAlert]}
              hitSlop={8}
            >
              <Ionicons name="notifications-outline" size={20} color={d.textPrimary} />
              {hasAlerts ? (
                <View style={[styles.bellBadge, alertCount > 9 && styles.bellBadgeWide]}>
                  <Text style={styles.bellBadgeText}>{alertCount > 99 ? '99+' : String(alertCount)}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable onPress={goToSettings} hitSlop={4} style={styles.avatarPressable}>
              <LinearGradient
                colors={['#5B8CFF', d.blue, '#4F2FD9']}
                style={styles.avatarCircle}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>

        {/* ══════════ KPI STRIP ══════════ */}
        {isLoading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ marginRight: 14 }}>
                <SkeletonRect width={186} height={140} borderRadius={22} />
              </View>
            ))}
          </ScrollView>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
            <KpiCard
              index={0}
              icon="flash-outline"
              gradientColors={['#1A3A6E', '#1E4DA0', '#3B7BF8']}
              value={formatCurrency(dashboard?.today_revenue ?? 0)}
              label="Today's Revenue"
              sub={`${dashboard?.today_bills ?? 0} bills`}
              subIcon="receipt-outline"
              accentColor="#93C5FD"
            />
            <KpiCard
              index={1}
              icon="trending-up-outline"
              gradientColors={['#14352A', '#1A4736', '#22C55E']}
              value={formatCurrency(dashboard?.week_revenue ?? 0)}
              label="This Week"
              accentColor="#86EFAC"
            />
            <KpiCard
              index={2}
              icon="people-outline"
              gradientColors={['#3D2C0A', '#553B0E', '#F59E0B']}
              value={formatCurrency(dashboard?.outstanding_receivable ?? 0)}
              label="Receivable"
              sub={(dashboard?.outstanding_receivable ?? 0) > 0 ? 'Pending' : undefined}
              subIcon="time-outline"
              accentColor="#FCD34D"
            />
            <KpiCard
              index={3}
              icon="business-outline"
              gradientColors={['#3D1414', '#551B1B', '#EF4444']}
              value={formatCurrency(dashboard?.outstanding_payable ?? 0)}
              label="Payable"
              accentColor="#FCA5A5"
            />
          </ScrollView>
        )}

        {/* ══════════ ALERT CHIPS ══════════ */}
        {!isLoading && dashboard ? (
          <View style={styles.chipRow}>
            {(dashboard.low_stock_count ?? 0) > 0 && (
              <AlertChip
                label={`${dashboard.low_stock_count} Low Stock`}
                bgColor={d.amberLight}
                borderColor={`${d.amber}40`}
                textColor={d.amber}
                dotColor={d.amber}
                onPress={() => router.push({ pathname: '/(app)/(tabs)/inventory' as never, params: { filter: 'low_stock' } })}
              />
            )}
            {(dashboard.expiry_count_30d ?? 0) > 0 && (
              <AlertChip
                label={`${dashboard.expiry_count_30d} Expiring`}
                bgColor={d.redLight}
                borderColor={`${d.red}40`}
                textColor={d.red}
                dotColor={d.red}
                onPress={() => router.push({ pathname: '/(app)/(tabs)/inventory' as never, params: { filter: 'expiring' } })}
              />
            )}
            {(dashboard.shortbook_count ?? 0) > 0 && (
              <AlertChip
                label={`${dashboard.shortbook_count} Shortbook`}
                bgColor={d.blueLight}
                borderColor={`${d.blue}40`}
                textColor={d.blue}
                dotColor={d.blue}
                onPress={() => router.push('/(app)/(tabs)/inventory' as never)}
              />
            )}
          </View>
        ) : null}

        {/* ══════════ REVENUE CHART ══════════ */}
        <Animated.View entering={FadeInDown.delay(200).springify().damping(20)}>
          <GlassCard style={styles.chartCard}>
            {/* Chart header */}
            <View style={styles.chartHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.chartSectionLabel}>Revenue trend</Text>
                <Text style={styles.chartSectionHint}>Net collected across the selected window</Text>
              </View>
              <View style={styles.pillRow}>
                {(['7D', '30D', '90D'] as ChartPeriod[]).map((p) => (
                  <PeriodPill key={p} label={p} selected={chartPeriod === p} onPress={() => setChartPeriod(p)} />
                ))}
              </View>
            </View>

            {/* Divider */}
            <View style={styles.chartDivider} />

            {isTrendLoading ? (
              <SkeletonRect width={chartWidth} height={180} borderRadius={8} />
            ) : (
              <RevenueChart data={trendDataArr} chartWidth={chartWidth} />
            )}
          </GlassCard>
        </Animated.View>

        {/* ══════════ STAT STRIP ══════════ */}
        <View style={styles.statStripRow}>
          <StatStrip index={0} label="Avg Basket" value={avgBasket} color={d.blue} icon="basket-outline" />
          <StatStrip index={1} label="Bills Today" value={String(dashboard?.today_bills ?? 0)} color={d.green} icon="receipt-outline" />
          <StatStrip index={2} label="Week Rev." value={formatCurrency(dashboard?.week_revenue ?? 0)} color={d.purple} icon="bar-chart-outline" />
        </View>

        {/* ══════════ RECENT ACTIVITY ══════════ */}
        <View style={styles.activitySection}>
          <SectionHeader
            eyebrow="Live feed"
            title="Recent Activity"
            action="See all"
            onAction={() => router.push('/(app)/(tabs)/pos' as never)}
          />

          {isLoading ? (
            <GlassCard style={{ padding: 16, gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <SkeletonRect key={i} width={screenWidth - 80} height={58} borderRadius={10} />
              ))}
            </GlassCard>
          ) : (dashboard?.recent_activity?.length ?? 0) === 0 ? (
            <EmptyActivity />
          ) : (
            <GlassCard>
              <FlashListAny
                data={dashboard?.recent_activity ?? []}
                keyExtractor={(item: ActivityItemData) => item.id}
                estimatedItemSize={76}
                scrollEnabled={false}
                renderItem={({ item, index }: { item: ActivityItemData; index: number }) => (
                  <ActivityItem item={item} index={index} />
                )}
              />
            </GlassCard>
          )}
        </View>
      </ScrollView>

      {/* ══════════ FAB ══════════ */}
      <Animated.View style={[styles.fabWrap, fabAnimStyle, { bottom: 28 + insets.bottom }]}>
        <Pressable
          onPressIn={() => { fabScale.value = withSpring(0.9, { damping: 12 }); }}
          onPressOut={() => { fabScale.value = withSpring(1, { damping: 12 }); }}
          onPress={goToPOS}
          style={styles.fabPressable}
          hitSlop={8}
        >
          <LinearGradient
            colors={[d.blue, '#2855D8']}
            style={styles.fab}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="add" size={30} color="#FFFFFF" />
          </LinearGradient>
          {/* Glow ring */}
          <View style={styles.fabGlow} />
        </Pressable>
      </Animated.View>
    </View>
    </DashCtx.Provider>
  );
}

/* ═══════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════ */

function createStyles(d: DashboardTokens) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: d.bg,
  },
  scrollContent: {
    flexGrow: 1,
  },

  /* ── Background decorations ── */
  glowBlob: {
    position: 'absolute',
    borderRadius: 999,
    pointerEvents: 'none',
  },
  glowBlobBlue: {
    width: 340,
    height: 340,
    backgroundColor: d.glowBlue,
    top: -100,
    right: -120,
  },
  glowBlobPurple: {
    width: 280,
    height: 280,
    backgroundColor: d.glowPurple,
    bottom: 200,
    left: -100,
  },
  glowBlobTeal: {
    width: 220,
    height: 220,
    backgroundColor: d.glowTeal,
    top: 120,
    left: -80,
  },

  /* ── Header ── */
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: d.px,
    marginBottom: 28,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: d.radius.pill,
    backgroundColor: d.dateChipBg,
    borderWidth: 1,
    borderColor: d.bgGlassBorder,
  },
  dateChipText: {
    color: d.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  headerTitle: {
    color: d.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.4,
    lineHeight: 38,
    marginBottom: 6,
  },
  headerGreeting: {
    color: d.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  headerGreetingAccent: {
    color: d.textPrimary,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: d.headerBtnBg,
    borderWidth: 1,
    borderColor: d.bgGlassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBtnAlert: {
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: d.red,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: d.bg,
  },
  bellBadgeWide: {
    minWidth: 22,
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  avatarPressable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: d.avatarBorder,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  /* ── KPI ── */
  kpiScroll: {
    paddingHorizontal: d.px,
    marginBottom: 20,
  },
  kpiCard: {
    width: 186,
    height: 140,
    borderRadius: 22,
    padding: 18,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: d.kpiCardBorder,
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  kpiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 2,
  },
  kpiBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  kpiValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontFamily: d.fontSans,
  },
  kpiLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  kpiDecorRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    bottom: -32,
    right: -32,
  },

  /* ── Alert chips ── */
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: d.px,
    marginBottom: 20,
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    borderRadius: 100,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 6,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  /* ── Chart ── */
  chartCard: {
    marginHorizontal: d.px,
    borderRadius: 26,
    padding: 22,
    marginBottom: 22,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 8,
  },
  chartSectionLabel: {
    color: d.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 4,
    textTransform: 'none',
  },
  chartSectionHint: {
    color: d.textTertiary,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  chartDivider: {
    height: 1,
    backgroundColor: d.bgGlassBorder,
    marginBottom: 16,
  },
  chartDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  chartSumValue: {
    color: d.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    gap: 3,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  refLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: d.refLineColor,
    borderStyle: 'dashed',
  },
  pillRow: {
    flexDirection: 'row',
    backgroundColor: d.pillRowBg,
    borderRadius: 100,
    padding: 3,
    gap: 2,
    borderWidth: 1,
    borderColor: d.pillRowBorder,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 100,
  },
  pillSelected: {
    backgroundColor: d.blue,
    shadowColor: d.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 4,
  },
  pillUnselected: {
    backgroundColor: 'transparent',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  pillTextUnselected: {
    color: d.textSecondary,
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisLabel: {
    color: d.textTertiary,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  emptyChartText: {
    color: d.textTertiary,
    fontSize: 13,
    marginTop: 8,
  },

  /* ── Stat strip ── */
  statStripRow: {
    flexDirection: 'row',
    paddingHorizontal: d.px,
    gap: 10,
    marginBottom: 24,
  },
  statStrip: {
    flex: 1,
    backgroundColor: d.statStripBg,
    borderRadius: d.radius.lg,
    borderWidth: 1,
    borderColor: d.bgGlassBorder,
    borderLeftWidth: 3,
    padding: 14,
    gap: 2,
  },
  statStripValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statStripLabel: {
    color: d.textTertiary,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  /* ── Section header ── */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  sectionEyebrow: {
    color: d.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    color: d.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sectionActionHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingLeft: 8,
  },
  sectionAction: {
    color: d.blue,
    fontSize: 14,
    fontWeight: '600',
  },

  /* ── Activity ── */
  activitySection: {
    paddingHorizontal: d.px,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: d.bgGlassBorder,
    gap: 12,
  },
  activityAccent: {
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  activityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
    gap: 4,
  },
  activityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityInvoice: {
    color: d.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
    flex: 1,
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  activityCustomer: {
    color: d.textSecondary,
    fontSize: 12,
    fontWeight: '400',
    flex: 1,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modePill: {
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  modePillText: {
    color: d.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  activityTime: {
    color: d.textTertiary,
    fontSize: 11,
    fontWeight: '400',
  },

  /* ── Empty ── */
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyOrb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: d.blueLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${d.blue}30`,
  },
  emptyOrbGrad: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: d.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: d.textTertiary,
    fontSize: 13,
    fontWeight: '400',
  },

  /* ── FAB ── */
  fabWrap: {
    position: 'absolute',
    right: d.px,
  },
  fabPressable: {
    position: 'relative',
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: d.fabBorder,
    shadowColor: d.blue,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 14,
  },
  fabGlow: {
    position: 'absolute',
    inset: -8,
    borderRadius: 30,
    backgroundColor: d.blueGlow,
    zIndex: -1,
  },
});
}