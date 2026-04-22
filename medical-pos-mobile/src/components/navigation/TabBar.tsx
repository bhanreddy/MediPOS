/**
 * CustomTabBar — Version 10
 * iPhone-grade premium glassmorphism tab bar
 * Deep specular glass · Prismatic pill · Micro-animations · Perfect contrast
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { router } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

/* ─── Constants ─────────────────────────────────────── */

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_MARGIN = 16;
const INNER_WIDTH = SCREEN_WIDTH - H_MARGIN * 2;
const TAB_COUNT = 5;
const TAB_WIDTH = INNER_WIDTH / TAB_COUNT;
const PILL_W = 62;
const PILL_H = 44;
const BAR_HEIGHT = 68;
const SHELL_RADIUS = 32;
const ICON_SIZE_ACTIVE = 24;
const ICON_SIZE_IDLE = 22;

/* ─── Tab & More Definitions ────────────────────────── */

interface TabDef {
  route: string;
  label: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabDef[] = [
  { route: 'dashboard/index', label: 'Home',      iconActive: 'home',        iconInactive: 'home-outline'    },
  { route: 'pos/index',       label: 'POS',       iconActive: 'cart',        iconInactive: 'cart-outline'    },
  { route: 'inventory/index', label: 'Stock',     iconActive: 'cube',        iconInactive: 'cube-outline'    },
  { route: 'patients/index',  label: 'Patients',  iconActive: 'people',      iconInactive: 'people-outline'  },
  { route: '__more__',        label: 'More',      iconActive: 'grid',        iconInactive: 'grid-outline'    },
];

const MORE_ITEMS: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  accent?: string;
}[] = [
  { label: 'Suppliers',     icon: 'business-outline',   route: '/(app)/suppliers',             accent: '#6366f1' },
  { label: 'Sales',         icon: 'receipt-outline',     route: '/(app)/sales',                 accent: '#10b981' },
  { label: 'Purchases',     icon: 'bag-handle-outline',  route: '/(app)/purchases',             accent: '#f59e0b' },
  { label: 'Expenses',      icon: 'wallet-outline',      route: '/(app)/expenses',              accent: '#ef4444' },
  { label: 'Shortbook',     icon: 'clipboard-outline',   route: '/(app)/shortbook',             accent: '#8b5cf6' },
  { label: 'Reports',       icon: 'bar-chart-outline',   route: '/(app)/reports',                 accent: '#06b6d4' },
  { label: 'Accounting',    icon: 'calculator-outline',  route: '/(app)/reports/accounting',      accent: '#14b8a6' },
  { label: 'Settings',      icon: 'settings-outline',    route: '/(app)/settings',              accent: '#64748b' },
];

/* ─── Colour Utilities ──────────────────────────────── */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgba(hex: string, a: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(59,130,246,${a})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

/* ─── Animated Tab Icon ─────────────────────────────── */

interface AnimTabIconProps {
  isFocused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
  primary: string;
}

function AnimTabIcon({ isFocused, iconName, color, primary }: AnimTabIconProps) {
  const scale   = useSharedValue(1);
  const glowOp  = useSharedValue(0);
  const bounce  = useSharedValue(0);

  useEffect(() => {
    if (isFocused) {
      scale.value  = withSequence(
        withTiming(0.78, { duration: 90 }),
        withSpring(1.14, { stiffness: 520, damping: 18 }),
        withSpring(1.0,  { stiffness: 460, damping: 22 }),
      );
      glowOp.value = withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(180, withTiming(0, { duration: 340 })),
      );
      bounce.value = withSequence(
        withTiming(-4, { duration: 100 }),
        withSpring(0, { stiffness: 480, damping: 16 }),
      );
    }
  }, [isFocused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: bounce.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
    transform: [{ scale: interpolate(glowOp.value, [0, 1], [0.6, 1.4], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={s.iconContainer}>
      {/* Glow halo on activation */}
      <Animated.View
        style={[
          s.iconGlowHalo,
          { backgroundColor: rgba(primary, 0.35) },
          glowStyle,
        ]}
      />
      <Animated.View style={iconStyle}>
        <Ionicons
          name={iconName}
          size={isFocused ? ICON_SIZE_ACTIVE : ICON_SIZE_IDLE}
          color={color}
        />
      </Animated.View>
    </View>
  );
}

/* ─── More Sheet Item ───────────────────────────────── */

interface MoreItemProps {
  item: typeof MORE_ITEMS[0];
  isDark: boolean;
  borderColor: string;
  textColor: string;
  onPress: () => void;
}

function MoreGridItem({ item, isDark, borderColor, textColor, onPress }: MoreItemProps) {
  const press = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const handlePressIn = () => {
    press.value = withSpring(0.91, { stiffness: 600, damping: 20 });
  };
  const handlePressOut = () => {
    press.value = withSpring(1, { stiffness: 500, damping: 18 });
  };

  const accent = item.accent ?? '#3b82f6';

  return (
    <Animated.View style={[s.moreItemWrapper, animStyle]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={[
          s.moreItem,
          {
            borderColor,
            backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.88)',
          },
        ]}
      >
        {/* Specular gloss layer */}
        <LinearGradient
          colors={
            isDark
              ? ['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.0)']
              : ['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.25)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, s.moreItemGloss]}
        />

        {/* Icon orb */}
        <View
          style={[
            s.moreIconOrb,
            {
              backgroundColor: isDark ? rgba(accent, 0.18) : rgba(accent, 0.12),
              borderColor: isDark ? rgba(accent, 0.35) : rgba(accent, 0.22),
            },
          ]}
        >
          <LinearGradient
            colors={[rgba(accent, isDark ? 0.28 : 0.18), rgba(accent, 0.0)]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name={item.icon} size={22} color={accent} />
        </View>

        <Text
          style={[
            s.moreLabel,
            {
              color: isDark ? 'rgba(255,255,255,0.87)' : 'rgba(10,14,30,0.82)',
              fontWeight: '600',
            },
          ]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─── Main Component ────────────────────────────────── */

interface CustomTabBarProps {
  state: any;
  navigation: any;
  descriptors: any;
}

export function CustomTabBar({ state, navigation }: CustomTabBarProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const moreSheetRef = useRef<BottomSheetModalMethods | null>(null);
  const primary = theme.colors.primary;

  const activeIndex = state.index;
  const chromeDark = isDark;

  /* ── Pill slide animation ── */
  const pillX = useSharedValue(activeIndex * TAB_WIDTH + (TAB_WIDTH - PILL_W) / 2);

  useEffect(() => {
    pillX.value = withSpring(activeIndex * TAB_WIDTH + (TAB_WIDTH - PILL_W) / 2, {
      stiffness: 420,
      damping: 36,
      mass: 0.72,
    });
  }, [activeIndex]);

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  /* ── Glass token map ── */
  const glass = useMemo(() => {
    if (chromeDark) {
      return {
        blurIntensity: 90,
        androidBase: 'rgba(12,14,24,0.93)',
        /* Specular top highlight */
        specular:     ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] as const,
        /* Frosted mid body */
        frosted:      ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.0)'] as const,
        /* Bottom vignette */
        vignette:     ['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)'] as const,
        outerBorder:  'rgba(255,255,255,0.16)',
        innerRim1:    'rgba(255,255,255,0.09)',
        innerRim2:    'rgba(0,0,0,0.55)',
        ambient:      rgba(primary, 0.16),
        shadowColor:  '#000',
        shadowOp:     0.72,
        shadowRadius: 40,
        shadowY:      18,
        elev:         28,
      };
    }
    return {
      blurIntensity: 100,
      androidBase: 'rgba(248,250,255,0.95)',
      specular:     ['rgba(255,255,255,1)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'] as const,
      frosted:      ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)'] as const,
      vignette:     ['rgba(0,20,60,0)', 'rgba(0,20,60,0.05)'] as const,
      outerBorder:  'rgba(255,255,255,0.95)',
      innerRim1:    'rgba(255,255,255,0.7)',
      innerRim2:    'rgba(200,215,240,0.3)',
      ambient:      rgba(primary, 0.10),
      shadowColor:  primary,
      shadowOp:     0.18,
      shadowRadius: 28,
      shadowY:      12,
      elev:         14,
    };
  }, [chromeDark, primary]);

  /* ── Pill token map ── */
  const pill = useMemo(() => {
    if (chromeDark) {
      return {
        fillTop:    rgba(primary, 0.38),
        fillBot:    rgba(primary, 0.08),
        specTop:    'rgba(255,255,255,0.30)',
        specBot:    'rgba(255,255,255,0.0)',
        border:     rgba(primary, 0.55),
        glow:       rgba(primary, 0.60),
        glowRadius: 18,
        glowOp:     0.60,
      };
    }
    return {
      fillTop:    rgba(primary, 0.22),
      fillBot:    rgba(primary, 0.05),
      specTop:    'rgba(255,255,255,0.92)',
      specBot:    'rgba(255,255,255,0.0)',
      border:     rgba(primary, 0.30),
      glow:       rgba(primary, 0.30),
      glowRadius: 14,
      glowOp:     0.45,
    };
  }, [chromeDark, primary]);

  /* ── Handlers ── */
  const handleTabPress = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (TABS[index].route === '__more__') {
      moreSheetRef.current?.present();
      return;
    }

    const route = state.routes[index];
    if (!route) return;

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (activeIndex !== index && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }, [activeIndex, navigation, state]);

  const renderMoreBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.52} />
    ),
    []
  );

  const handleMoreItem = useCallback((route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    moreSheetRef.current?.dismiss();
    setTimeout(() => router.push(route as any), 220);
  }, []);

  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <>
      <View style={[s.outer, { paddingBottom: bottomPad }]}>

        {/* ── Ambient glow underneath ── */}
        <View
          pointerEvents="none"
          style={[
            s.ambientHalo,
            { backgroundColor: glass.ambient },
          ]}
        />

        {/* ── Lift shadow wrapper ── */}
        <View
          style={[
            s.liftShadow,
            {
              shadowColor: glass.shadowColor,
              shadowOpacity: glass.shadowOp,
              shadowRadius: glass.shadowRadius,
              shadowOffset: { width: 0, height: glass.shadowY },
              elevation: glass.elev,
            },
          ]}
        >
          {/* ── Glass shell ── */}
          <View
            style={[
              s.glassShell,
              {
                borderRadius: SHELL_RADIUS,
                borderColor: glass.outerBorder,
              },
            ]}
          >
            {/* Blur / frosted base */}
            {Platform.OS === 'ios' ? (
              <BlurView
                intensity={glass.blurIntensity}
                tint={chromeDark ? 'dark' : 'extraLight'}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.androidBase }]} />
            )}

            {/* Specular top highlight — the "glass dome" reflection */}
            <LinearGradient
              colors={glass.specular}
              locations={[0, 0.30, 1]}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.85, y: 0.9 }}
              style={[StyleSheet.absoluteFill, s.noPointer]}
            />

            {/* Frosted centre wash */}
            <LinearGradient
              colors={glass.frosted}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[StyleSheet.absoluteFill, s.noPointer]}
            />

            {/* Vignette base */}
            <LinearGradient
              colors={glass.vignette}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 0.5, y: 1 }}
              style={[StyleSheet.absoluteFill, s.noPointer]}
            />

            {/* Outer glass rim (inner shadow) */}
            <View
              pointerEvents="none"
              style={[
                s.rimOuter,
                { borderRadius: SHELL_RADIUS, borderColor: glass.innerRim1 },
              ]}
            />
            {/* Second deep rim for depth */}
            <View
              pointerEvents="none"
              style={[
                s.rimInner,
                { borderRadius: SHELL_RADIUS - 2, borderColor: glass.innerRim2 },
              ]}
            />

            {/* ── Tab row ── */}
            <View style={s.row}>

              {/* Sliding active pill */}
              <Animated.View
                style={[
                  s.pill,
                  {
                    width: PILL_W,
                    height: PILL_H,
                    borderRadius: PILL_H / 2,
                    top: (BAR_HEIGHT - PILL_H) / 2,
                    shadowColor: pill.glow,
                    shadowOpacity: pill.glowOp,
                    shadowRadius: pill.glowRadius,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 10,
                  },
                  pillAnimStyle,
                ]}
              >
                {/* Pill fill gradient */}
                <LinearGradient
                  colors={[pill.fillTop, pill.fillBot]}
                  locations={[0, 1]}
                  start={{ x: 0.25, y: 0 }}
                  end={{ x: 0.78, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: PILL_H / 2 }]}
                />
                {/* Pill specular gloss — top half only */}
                <LinearGradient
                  colors={[pill.specTop, pill.specBot]}
                  locations={[0, 1]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 0.75 }}
                  style={[s.pillGloss, { borderRadius: PILL_H / 2 }]}
                />
                {/* Pill edge stroke */}
                <View
                  style={[
                    s.pillBorder,
                    { borderRadius: PILL_H / 2, borderColor: pill.border },
                  ]}
                />
              </Animated.View>

              {/* Tab buttons */}
              {TABS.map((tab, index) => {
                const isFocused = tab.route !== '__more__' && activeIndex === index;
                const iconName  = isFocused ? tab.iconActive : tab.iconInactive;
                const iconColor = isFocused
                  ? primary
                  : chromeDark
                    ? 'rgba(255,255,255,0.42)'
                    : 'rgba(10,14,30,0.38)';
                const labelColor = isFocused
                  ? primary
                  : chromeDark
                    ? 'rgba(255,255,255,0.38)'
                    : 'rgba(10,14,30,0.34)';

                return (
                  <TouchableOpacity
                    key={tab.route}
                    style={s.tab}
                    onPress={() => handleTabPress(index)}
                    activeOpacity={0.75}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isFocused }}
                    accessibilityLabel={tab.label}
                  >
                    <AnimTabIcon
                      isFocused={isFocused}
                      iconName={iconName}
                      color={iconColor}
                      primary={primary}
                    />

                    <Text
                      style={[
                        s.label,
                        {
                          color: labelColor,
                          fontWeight: isFocused ? '700' : '500',
                          opacity: isFocused ? 1 : 0.9,
                          letterSpacing: isFocused ? 0.3 : 0.15,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      {/* ── More (modal portals above tabs — avoids broken expand() inside tab chrome) ── */}
      <BottomSheetModal
        ref={moreSheetRef}
        snapPoints={['58%']}
        enablePanDownToClose
        backdropComponent={renderMoreBackdrop}
        backgroundStyle={{
          backgroundColor: isDark ? 'rgba(18, 22, 34, 0.97)' : theme.colors.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : theme.colors.border,
        }}
      >
        <BottomSheetView style={{ flex: 1, paddingBottom: 12 }}>
          <Text
            style={{
              textAlign: 'center',
              marginBottom: 14,
              color: theme.colors.text.primary,
              fontFamily: theme.typography.family.semiBold,
              fontSize: theme.typography.size.lg,
            }}
          >
            More
          </Text>
          <View style={s.moreGrid}>
            {MORE_ITEMS.map((item) => (
              <MoreGridItem
                key={item.route}
                item={item}
                isDark={chromeDark}
                borderColor={isDark ? 'rgba(255,255,255,0.10)' : 'rgba(200,210,230,0.55)'}
                textColor={theme.colors.text.primary}
                onPress={() => handleMoreItem(item.route)}
              />
            ))}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}

/* ─── Styles ─────────────────────────────────────────── */

const s = StyleSheet.create({
  outer: {
    paddingHorizontal: H_MARGIN,
    paddingTop: 6,
  },

  /* Soft ambient halo behind the bar */
  ambientHalo: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    height: 28,
    bottom: 8,
    borderRadius: 36,
    zIndex: 0,
    opacity: 0.85,
  },

  liftShadow: {
    borderRadius: SHELL_RADIUS,
    position: 'relative',
    overflow: 'visible',
    zIndex: 1,
  },

  /* The frosted glass body */
  glassShell: {
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: BAR_HEIGHT,
    position: 'relative',
  },

  noPointer: { pointerEvents: 'none' },

  /* Outer glass rim — top highlight ring */
  rimOuter: {
    ...StyleSheet.absoluteFillObject,
    margin: 0,
    borderWidth: 1,
    pointerEvents: 'none',
  },

  /* Inner deep shadow ring for concavity illusion */
  rimInner: {
    ...StyleSheet.absoluteFillObject,
    margin: 2,
    borderWidth: StyleSheet.hairlineWidth,
    pointerEvents: 'none',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BAR_HEIGHT,
    position: 'relative',
    zIndex: 2,
  },

  /* ── Active pill ── */
  pill: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  pillGloss: {
    ...StyleSheet.absoluteFillObject,
    // Covers only top 55% for realistic glass bulge
    bottom: '45%',
    margin: 0.5,
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    margin: 0.5,
    borderWidth: 1,
    pointerEvents: 'none',
  },

  /* ── Tab item ── */
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    zIndex: 1,
    minHeight: BAR_HEIGHT,
  },

  /* ── Icon container with glow ── */
  iconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconGlowHalo: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    pointerEvents: 'none',
  },

  /* ── Tab label ── */
  label: {
    fontSize: 10,
    marginTop: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  /* ── More sheet grid ── */
  moreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingTop: 6,
    gap: 12,
    justifyContent: 'flex-start',
  },
  moreItemWrapper: {
    width: '30%',
  },
  moreItem: {
    aspectRatio: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  moreItemGloss: {
    borderRadius: 20,
    pointerEvents: 'none',
  },
  moreIconOrb: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  moreLabel: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    includeFontPadding: false,
  },
});