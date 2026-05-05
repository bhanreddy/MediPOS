/*
 * Inventory Screen — Clean Light Design System
 * ─────────────────────────────────────────────
 * Matches POS / Home page aesthetic: white surfaces, crisp blue accent,
 * subtle shadows, iOS-native feel — zero glassmorphism.
 *
 * PRESERVED: All business logic, hooks, navigation, FlashList, haptics.
 * CHANGED:   Full visual layer — tokens, StyleSheet, layout structure.
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
  ScrollView,
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
  FadeIn,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/hooks/useTheme';
import {
  useMedicines,
  useLowStock,
  useExpiringBatches,
  useStockSummary,
  useAddToShortbook,
} from '@/hooks/useInventory';
import { formatCurrency, formatDate } from '@/utils/format';
import type { Medicine, MedicineBatch } from '@/api/inventory';

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = ['All Medicines', 'Low Stock', 'Expiring'];

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

const RADIUS = {
  chip: 20,
  input: 14,
  card: 16,
  fab: 28,
  pill: 100,
} as const;

const TYPE = {
  micro: 11,
  caption: 12,
  body: 14,
  lead: 16,
  title: 24,
} as const;

// ─── Light Design Tokens ─────────────────────────────────────────────────────

const LIGHT = {
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#F8FAFC',
  border: 'rgba(15, 23, 42, 0.08)',
  borderMedium: 'rgba(15, 23, 42, 0.12)',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textOnAccent: '#FFFFFF',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  accentMid: '#DBEAFE',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerMid: '#FECACA',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  warningMid: '#FDE68A',
  success: '#16A34A',
  successLight: '#F0FDF4',
  amber: '#B45309',
  amberLight: '#FFFBEB',
  shadow: 'rgba(15, 23, 42, 0.08)',
  shadowMd: 'rgba(15, 23, 42, 0.12)',
} as const;

// ─── Elevation helpers ────────────────────────────────────────────────────────

const elevation = (level: 'xs' | 'sm' | 'md' | 'lg'): ViewStyle => {
  const map = {
    xs: Platform.select({
      ios: { shadowColor: LIGHT.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 3 },
      default: { elevation: 2 },
    }),
    sm: Platform.select({
      ios: { shadowColor: LIGHT.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
      default: { elevation: 4 },
    }),
    md: Platform.select({
      ios: { shadowColor: LIGHT.shadowMd, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      default: { elevation: 8 },
    }),
    lg: Platform.select({
      ios: { shadowColor: LIGHT.shadowMd, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 24 },
      default: { elevation: 16 },
    }),
  };
  return map[level] as ViewStyle;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(safeTop: number, fontsReady: boolean) {
  const display = fontsReady ? 'Syne_700Bold' : Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
  const semibold = fontsReady ? 'PlusJakartaSans_600SemiBold' : undefined;
  const medium = fontsReady ? 'PlusJakartaSans_500Medium' : undefined;
  const regular = fontsReady ? 'PlusJakartaSans_400Regular' : undefined;

  return StyleSheet.create({
    // Root
    root: {
      flex: 1,
      backgroundColor: LIGHT.bg,
    },

    // Header
    header: {
      backgroundColor: LIGHT.surface,
      paddingTop: safeTop + SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: LIGHT.border,
      ...elevation('sm'),
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    headerTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    headerAccentDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: LIGHT.accent,
    },
    headerTitle: {
      fontFamily: display,
      fontSize: TYPE.title,
      color: LIGHT.textPrimary,
      letterSpacing: -0.5,
    },
    headerSubtitle: {
      fontSize: TYPE.caption,
      color: LIGHT.textMuted,
      fontFamily: regular,
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    summaryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: LIGHT.surfaceSecondary,
      borderRadius: RADIUS.chip,
      paddingHorizontal: SPACING.sm + 4,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: LIGHT.border,
    },
    summaryChipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    summaryChipText: {
      fontSize: TYPE.caption,
      color: LIGHT.textSecondary,
      fontFamily: medium,
      fontWeight: '500',
    },

    // Search
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: LIGHT.bg,
      borderRadius: RADIUS.input,
      borderWidth: 1,
      borderColor: LIGHT.border,
      paddingHorizontal: SPACING.sm + 4,
      minHeight: 44,
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    searchInput: {
      flex: 1,
      fontSize: TYPE.body,
      color: LIGHT.textPrimary,
      fontFamily: medium,
      paddingVertical: 0,
    },

    // Filter chips (horizontal scroll row)
    filterRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: 2,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: SPACING.sm + 4,
      paddingVertical: 6,
      borderRadius: RADIUS.chip,
      borderWidth: 1,
      borderColor: LIGHT.border,
      backgroundColor: LIGHT.surface,
    },
    filterChipActive: {
      backgroundColor: LIGHT.accentMid,
      borderColor: LIGHT.accent,
    },
    filterChipDanger: {
      backgroundColor: LIGHT.dangerLight,
      borderColor: LIGHT.dangerMid,
    },
    filterChipWarning: {
      backgroundColor: LIGHT.warningLight,
      borderColor: LIGHT.warningMid,
    },
    filterChipAccent: {
      backgroundColor: LIGHT.accentLight,
      borderColor: LIGHT.accentMid,
    },
    filterChipText: {
      fontSize: TYPE.caption,
      fontFamily: semibold,
      fontWeight: '600',
      color: LIGHT.textSecondary,
    },
    filterChipTextDanger: { color: LIGHT.danger },
    filterChipTextWarning: { color: LIGHT.warning },
    filterChipTextAccent: { color: LIGHT.accent },

    // Tab bar
    tabBarWrap: {
      backgroundColor: LIGHT.surface,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: LIGHT.border,
    },
    tabBarInner: {
      flexDirection: 'row',
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingBottom: SPACING.sm,
    },
    tabText: {
      fontSize: TYPE.body,
      fontFamily: medium,
      color: LIGHT.textMuted,
    },
    tabTextActive: {
      fontSize: TYPE.body,
      fontFamily: semibold,
      color: LIGHT.accent,
      fontWeight: '600',
    },
    tabIndicatorTrack: {
      flexDirection: 'row',
      position: 'relative',
      height: 2,
      backgroundColor: LIGHT.border,
      borderRadius: 1,
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      height: 2,
      width: `${100 / TABS.length}%`,
      borderRadius: 1,
      backgroundColor: LIGHT.accent,
    },

    // List
    listContent: {
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },

    // Medicine Card
    cardWrap: {
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
      borderRadius: RADIUS.card,
      backgroundColor: LIGHT.surface,
      borderWidth: 1,
      borderColor: LIGHT.border,
      ...elevation('xs'),
    },
    cardWrapDanger: {
      borderLeftWidth: 3,
      borderLeftColor: LIGHT.danger,
    },
    cardWrapWarning: {
      borderLeftWidth: 3,
      borderLeftColor: LIGHT.warning,
    },
    cardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm + 4,
    },
    iconWell: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: LIGHT.accentLight,
      flexShrink: 0,
    },
    cardCenter: {
      flex: 1,
      minWidth: 0,
    },
    medName: {
      fontSize: TYPE.lead,
      fontFamily: semibold,
      color: LIGHT.textPrimary,
      fontWeight: '600',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    medGeneric: {
      fontSize: TYPE.caption,
      fontFamily: regular,
      color: LIGHT.textSecondary,
      marginBottom: 2,
    },
    medMfg: {
      fontSize: TYPE.micro,
      fontFamily: regular,
      color: LIGHT.textMuted,
    },
    cardRight: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    stockValue: {
      fontSize: TYPE.title,
      fontFamily: semibold,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    stockOk: { color: LIGHT.accent },
    stockWarn: { color: LIGHT.warning },
    stockDanger: { color: LIGHT.danger },
    stockUnits: {
      fontSize: TYPE.micro,
      color: LIGHT.textMuted,
      fontFamily: medium,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    categoryPill: {
      backgroundColor: LIGHT.bg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: LIGHT.border,
    },
    categoryPillText: {
      fontSize: TYPE.micro,
      color: LIGHT.textSecondary,
      fontFamily: semibold,
      fontWeight: '600',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    h1Badge: {
      position: 'absolute',
      top: SPACING.sm,
      left: SPACING.sm,
      backgroundColor: LIGHT.danger,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
      zIndex: 2,
    },
    h1BadgeText: {
      fontSize: TYPE.micro,
      color: '#FFFFFF',
      fontFamily: semibold,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    divider: {
      height: 1,
      backgroundColor: LIGHT.border,
      marginHorizontal: SPACING.md,
    },

    // Shortbook CTA
    shortbookBtn: {
      marginTop: SPACING.sm,
      marginHorizontal: SPACING.md,
      marginBottom: SPACING.md,
      height: 38,
      borderRadius: RADIUS.input,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: LIGHT.accentLight,
      borderWidth: 1,
      borderColor: LIGHT.accentMid,
    },
    shortbookBtnText: {
      fontSize: TYPE.caption,
      color: LIGHT.accent,
      fontFamily: semibold,
      fontWeight: '600',
    },

    // Expiring Card
    expCardInner: {
      padding: SPACING.md,
    },
    expRowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    expBatch: {
      fontSize: TYPE.lead,
      fontFamily: semibold,
      color: LIGHT.textPrimary,
      fontWeight: '600',
    },
    expDaysDanger: { fontSize: TYPE.caption, color: LIGHT.danger, fontFamily: semibold, fontWeight: '700' },
    expDaysWarn: { fontSize: TYPE.caption, color: LIGHT.warning, fontFamily: semibold, fontWeight: '700' },
    expDaysAmber: { fontSize: TYPE.caption, color: LIGHT.amber, fontFamily: semibold, fontWeight: '700' },
    expDaysOk: { fontSize: TYPE.caption, color: LIGHT.success, fontFamily: semibold, fontWeight: '700' },
    expRowBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    expMeta: {
      fontSize: TYPE.caption,
      color: LIGHT.textSecondary,
      fontFamily: regular,
    },

    // Empty state
    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.xxl + SPACING.lg,
      minHeight: 300,
    },
    emptyIconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: LIGHT.accentLight,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: LIGHT.accentMid,
    },
    emptyTitle: {
      fontSize: TYPE.lead + 2,
      fontFamily: fontsReady ? ('Syne_600SemiBold' as const) : undefined,
      fontWeight: '700',
      color: LIGHT.textPrimary,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    emptySubtitle: {
      fontSize: TYPE.body,
      color: LIGHT.textMuted,
      textAlign: 'center',
      fontFamily: regular,
      lineHeight: 20,
    },

    // FAB
    fab: {
      position: 'absolute',
      bottom: SPACING.lg + 4,
      right: SPACING.md,
      width: 56,
      height: 56,
      borderRadius: RADIUS.fab,
      backgroundColor: LIGHT.accent,
      justifyContent: 'center',
      alignItems: 'center',
      ...elevation('lg'),
    },

    // Section label
    sectionLabel: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      fontSize: TYPE.caption,
      fontFamily: semibold,
      fontWeight: '600',
      color: LIGHT.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InventoryIndexScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [fontsLoaded] = useFonts({
    Syne_700Bold,
    Syne_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
  });

  const styles = useMemo(
    () => createStyles(insets.top, !!fontsLoaded),
    [insets.top, fontsLoaded]
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

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  };

  const indicatorPosition = useSharedValue(0);

  const handleTabPress = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(index);
    indicatorPosition.value = withTiming(index, { duration: 220 });
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value * 100 + '%' as any }],
  }));

  const handleMedicinePress = (id: string) => {
    router.push(`/(app)/inventory/${id}`);
  };

  const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    const map: Record<string, keyof typeof Ionicons.glyphMap> = {
      Tablet: 'medical-outline',
      Capsule: 'medical-outline',
      Syrup: 'water-outline',
      Drops: 'water-outline',
      Injection: 'flask-outline',
      Cream: 'leaf-outline',
    };
    return map[category] ?? 'cube-outline';
  };

  const stockTone = (item: Medicine) => {
    const qty = item.total_stock ?? 0;
    if (qty === 0) return 'stockDanger';
    if (qty <= (item.reorderLevel ?? 10)) return 'stockWarn';
    return 'stockOk';
  };

  const cardBorderStyle = (item: Medicine) => {
    const tone = stockTone(item);
    if (tone === 'stockDanger') return styles.cardWrapDanger;
    if (tone === 'stockWarn') return styles.cardWrapWarning;
    return null;
  };

  // ─── Empty State ───────────────────────────────────────────────────────────

  const listEmpty = (isLoading: boolean, tab: 0 | 1 | 2) => {
    if (isLoading) {
      return (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="large" color={LIGHT.accent} />
        </View>
      );
    }
    const copy: Record<number, { title: string; sub: string; icon: keyof typeof Ionicons.glyphMap }> = {
      0: { title: 'No medicines found', sub: 'Try another search, or add a new product to your catalog.', icon: 'search-outline' },
      1: { title: 'Stock looks healthy', sub: 'Nothing below reorder level right now. Great work!', icon: 'checkmark-circle-outline' },
      2: { title: 'No expiring batches', sub: 'Nothing in the next 90 days needs attention.', icon: 'shield-checkmark-outline' },
    };
    const c = copy[tab];
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.emptyWrap}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name={c.icon} size={28} color={LIGHT.accent} />
        </View>
        <Text style={styles.emptyTitle}>{c.title}</Text>
        <Text style={styles.emptySubtitle}>{c.sub}</Text>
      </Animated.View>
    );
  };

  // ─── Medicine Card ─────────────────────────────────────────────────────────

  const renderMedicineCard = (item: Medicine, isLowStockTab: boolean, index: number) => {
    const tone = stockTone(item);
    const borderOverride = cardBorderStyle(item);

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40).duration(280)}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.cardWrap, borderOverride]}
          onPress={() => handleMedicinePress(item.id)}
        >
          {item.schedule === 'H1' && (
            <View style={styles.h1Badge}>
              <Text style={styles.h1BadgeText}>H1</Text>
            </View>
          )}

          <View style={styles.cardInner}>
            {/* Icon well */}
            <View style={styles.iconWell}>
              <Ionicons name={getCategoryIcon(item.category)} size={20} color={LIGHT.accent} />
            </View>

            {/* Center info */}
            <View style={styles.cardCenter}>
              <Text style={styles.medName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.medGeneric} numberOfLines={1}>{item.genericName}</Text>
              <Text style={styles.medMfg} numberOfLines={1}>{item.manufacturer}</Text>
            </View>

            {/* Right — stock */}
            <View style={styles.cardRight}>
              <Text style={[styles.stockValue, styles[tone]]}>{item.total_stock ?? 0}</Text>
              <Text style={styles.stockUnits}>units</Text>
              <View style={styles.categoryPill}>
                <Text style={styles.categoryPillText}>{item.category}</Text>
              </View>
            </View>
          </View>

          {isLowStockTab && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.shortbookBtn}
                onPress={() => addToShortbook.mutate(item.id)}
                disabled={addToShortbook.isPending}
                activeOpacity={0.88}
              >
                {addToShortbook.isPending ? (
                  <ActivityIndicator size="small" color={LIGHT.accent} />
                ) : (
                  <Text style={styles.shortbookBtnText}>+ Add to Shortbook</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ─── Expiring Card ─────────────────────────────────────────────────────────

  type ExpKey = 'expDaysDanger' | 'expDaysWarn' | 'expDaysAmber' | 'expDaysOk';
  type BorderKey = 'cardWrapDanger' | 'cardWrapWarning' | null;

  const expDaysStyle = (days: number): ExpKey => {
    if (days < 30) return 'expDaysDanger';
    if (days < 60) return 'expDaysWarn';
    if (days < 90) return 'expDaysAmber';
    return 'expDaysOk';
  };

  const expBorderStyle = (days: number): BorderKey => {
    if (days < 30) return 'cardWrapDanger';
    if (days < 60) return 'cardWrapWarning';
    return null;
  };

  const renderExpiringCard = (batch: MedicineBatch & { name?: string }, index: number) => {
    const days = Math.floor(
      (new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const daysKey = expDaysStyle(days);
    const borderKey = expBorderStyle(days);

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40).duration(280)}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.cardWrap, borderKey ? styles[borderKey] : null]}
          onPress={() => handleMedicinePress(batch.medicineId)}
        >
          <View style={styles.expCardInner}>
            <View style={styles.expRowTop}>
              <Text style={styles.expBatch}>{batch.batchNumber}</Text>
              <Text style={styles[daysKey]}>
                {days < 0 ? 'Expired' : `${days}d left`}
              </Text>
            </View>
            <View style={styles.expRowBottom}>
              <Text style={styles.expMeta}>Exp: {formatDate(batch.expiryDate)}</Text>
              <Text style={styles.expMeta}>Qty: {batch.quantity}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.headerTitleGroup}>
              <View style={styles.headerAccentDot} />
              <Text style={styles.headerTitle}>Inventory</Text>
            </View>
            <Text style={styles.headerSubtitle}>Browse stock, batches, and schedules</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={LIGHT.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search medicines..."
            placeholderTextColor={LIGHT.textMuted}
            value={search}
            onChangeText={handleSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setDebouncedSearch(''); }}>
              <Ionicons name="close-circle" size={18} color={LIGHT.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <View style={styles.filterChip}>
            <Text style={styles.filterChipText}>All</Text>
          </View>
          <View style={[styles.filterChip, styles.filterChipDanger]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: LIGHT.danger }} />
            <Text style={[styles.filterChipText, styles.filterChipTextDanger]}>Low Stock</Text>
          </View>
          <View style={[styles.filterChip, styles.filterChipWarning]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: LIGHT.warning }} />
            <Text style={[styles.filterChipText, styles.filterChipTextWarning]}>Expiring</Text>
          </View>
          <View style={[styles.filterChip, styles.filterChipAccent]}>
            <Text style={[styles.filterChipText, styles.filterChipTextAccent]}>Schedule H1</Text>
          </View>
        </ScrollView>

        {/* Summary chips */}
        {summaryData && (
          <Animated.View entering={FadeIn.duration(300)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.filterRow, { marginTop: SPACING.sm, paddingBottom: SPACING.xs }]}
            >
              <View style={styles.summaryChip}>
                <View style={[styles.summaryChipDot, { backgroundColor: LIGHT.accent }]} />
                <Text style={styles.summaryChipText}>{summaryData.totalProducts} medicines</Text>
              </View>
              <View style={styles.summaryChip}>
                <View style={[styles.summaryChipDot, { backgroundColor: LIGHT.success }]} />
                <Text style={styles.summaryChipText}>{formatCurrency(summaryData.totalStockValue)}</Text>
              </View>
            </ScrollView>
          </Animated.View>
        )}
      </View>

      {/* ── Tab Bar ── */}
      <View style={styles.tabBarWrap}>
        <View style={styles.tabBarInner}>
          {TABS.map((tab, idx) => (
            <TouchableOpacity
              key={tab}
              style={styles.tabItem}
              onPress={() => handleTabPress(idx)}
              activeOpacity={0.8}
            >
              <Text style={activeTab === idx ? styles.tabTextActive : styles.tabText}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tabIndicatorTrack}>
          <Animated.View style={[styles.tabIndicator, indicatorStyle]} />
        </View>
      </View>

      {/* ── List ── */}
      {activeTab === 0 && (
        <FlashListAny
          data={medicinesData || []}
          keyExtractor={(item: any) => item.id}
          estimatedItemSize={90}
          renderItem={({ item, index = 0 }: { item: Medicine; index?: number }) =>
            renderMedicineCard(item, false, index)
          }
          ListHeaderComponent={() =>
            (medicinesData?.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>{medicinesData?.length} results</Text>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => listEmpty(isLoadingAll, 0)}
        />
      )}

      {activeTab === 1 && (
        <FlashListAny
          data={lowStockData || []}
          keyExtractor={(item: any) => item.id}
          estimatedItemSize={120}
          renderItem={({ item, index = 0 }: { item: Medicine; index?: number }) =>
            renderMedicineCard(item, true, index)
          }
          ListHeaderComponent={() =>
            (lowStockData?.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>{lowStockData?.length} items below reorder level</Text>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => listEmpty(isLoadingLow, 1)}
        />
      )}

      {activeTab === 2 && (
        <FlashListAny
          data={expiringData || []}
          keyExtractor={(item: any) => item.id}
          estimatedItemSize={80}
          renderItem={({ item, index = 0 }: { item: MedicineBatch; index?: number }) =>
            renderExpiringCard(item, index)
          }
          ListHeaderComponent={() =>
            (expiringData?.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>{expiringData?.length} batches expiring in 90 days</Text>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => listEmpty(isLoadingExpiring, 2)}
        />
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/inventory/add')}
        activeOpacity={0.88}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}