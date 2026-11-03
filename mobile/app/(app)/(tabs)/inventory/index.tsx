import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceSearch, WorkspaceChip, WorkspaceFab } from '@/components/ui/Workspace';
import { mobileLayout } from '@/theme/mobileLayout';
import { useGlassPreferences } from '@/components/glass/LiquidGlass';

import { theme as lightTheme, darkTheme } from '@/theme';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
/*
 * Inventory Screen — Clean Light Design System
 * ─────────────────────────────────────────────
 * Matches POS / Home page aesthetic: white surfaces, crisp blue accent,
 * subtle shadows, iOS-native feel — zero glassmorphism.
 *
 * PRESERVED: All business logic, hooks, navigation, FlashList, haptics.
 * CHANGED:   Full visual layer — tokens, StyleSheet, layout structure.
 */

/*
 * Inventory Screen — Clean Light Design System
 * ─────────────────────────────────────────────
 * Matches POS / Home page aesthetic: white surfaces, crisp blue accent,
 * subtle shadows, iOS-native feel — zero glassmorphism.
 *
 * PRESERVED: All business logic, hooks, navigation, FlashList, haptics.
 * CHANGED:   Full visual layer — tokens, StyleSheet, layout structure.
 */
import { useState, useMemo } from 'react';
import { useWindowDimensions, View, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, ScrollView, type ViewStyle } from 'react-native';

import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { useMedicines, useStockSummary, useAddToShortbook } from '@/hooks/useInventory';
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
  chip: 8,
  input: 8,
  card: 14,
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

const inventoryPalette = (dark: boolean) => {
  const c = (dark ? darkTheme : lightTheme).colors;
  return {
    bg: c.background,
    surface: c.surface,
    surfaceSecondary: c.primaryLight,
    border: c.border,
    borderMedium: c.border,
    textPrimary: c.text.primary,
    textSecondary: c.text.secondary,
    textMuted: c.text.secondary,
    textOnAccent: c.text.inverse,
    accent: c.primary,
    accentLight: c.primaryLight,
    accentMid: c.primaryLight,
    danger: c.danger,
    dangerLight: c.dangerLight,
    dangerMid: `${c.danger}35`,
    warning: c.warning,
    warningLight: c.warningLight,
    warningMid: `${c.warning}35`,
    success: c.success,
    successLight: c.successLight,
    amber: c.warning,
    amberLight: c.warningLight,
    shadow: 'rgba(27,39,64,0.08)',
    shadowMd: 'rgba(27,39,64,0.12)',
  };
};
const LIGHT = inventoryPalette(false);


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

function createStyles(safeTop: number, fontsReady: boolean, LIGHT: ReturnType<typeof inventoryPalette>) {
  const display = fontsReady ? 'PlusJakartaSans_700Bold' : Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' });
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
      paddingHorizontal: 6,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },

    // Medicine Card
    cardWrap: {
      marginHorizontal: 6,
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
      color: LIGHT.textOnAccent,
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
      marginHorizontal: 6,
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
      minHeight: 160,
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
      fontFamily: fontsReady ? ('PlusJakartaSans_600SemiBold' as const) : undefined,
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
  const { theme, isDark } = useTheme();
  const { reduceMotion } = useGlassPreferences();
  const LIGHT = useMemo(() => inventoryPalette(isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);

  const styles = useMemo(
    () => createStyles(insets.top, true, LIGHT),
    [insets.top, LIGHT]
  );

  const [activeTab, setActiveTab] = useState(0);
  const [selectedChip, setSelectedChip] = useState<'all' | 'low_stock' | 'expiring' | 'schedule_h1'>('all');
  const [search, setSearch] = useState('');

  const queryParams = useMemo(() => {
    if (selectedChip === 'low_stock') {
      return { low_stock: true };
    }
    if (selectedChip === 'schedule_h1') {
      return { schedule_h1: true };
    }
    return {};
  }, [selectedChip]);

  const {
    data: medicinesData,
    isLoading,
    isError,
    refetch,
  } = useMedicines(queryParams);

  const { data: summaryData } = useStockSummary();

  const addToShortbook = useAddToShortbook();

  const handleSearch = (text: string) => {
    setSearch(text);
  };

  const processedAllMedicines = useMemo(() => {
    if (!medicinesData) return [];
    let list = medicinesData;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.manufacturer.toLowerCase().includes(q)
      );
    }
    return list;
  }, [medicinesData, search]);

  const processedLowStock = useMemo(() => {
    if (!medicinesData) return [];
    let list = medicinesData;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.manufacturer.toLowerCase().includes(q)
      );
    }
    return list;
  }, [medicinesData, search]);

  const processedExpiringBatches = useMemo(() => {
    if (!medicinesData) return [];
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + 90);
    const warningStr = warningDate.toISOString().split('T')[0];

    const batches: (MedicineBatch & { name: string; genericName?: string })[] = [];
    for (const med of medicinesData) {
      if (!med.medicine_batches) continue;
      for (const b of med.medicine_batches) {
        const qty = b.quantity;
        if (qty <= 0) continue;
        const expiry = b.expiryDate || '';
        if (expiry <= warningStr) {
          batches.push({
            ...b,
            name: med.name,
            genericName: med.genericName,
          });
        }
      }
    }

    batches.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      return batches.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.batchNumber.toLowerCase().includes(q) ||
          (b.genericName && b.genericName.toLowerCase().includes(q))
      );
    }

    return batches;
  }, [medicinesData, search]);

  const handleChipPress = (chip: 'all' | 'low_stock' | 'expiring' | 'schedule_h1') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedChip(chip);
    if (chip === 'all') {
      setActiveTab(0);

    } else if (chip === 'low_stock') {
      setActiveTab(1);

    } else if (chip === 'expiring') {
      setActiveTab(2);

    } else if (chip === 'schedule_h1') {
      setActiveTab(0);

    }
  };

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

  const listEmpty = (isLoading: boolean, isError: boolean, tab: 0 | 1 | 2) => {
    if (isLoading) {
      return (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="large" color={LIGHT.accent} />
        </View>
      );
    }
    if (isError) {
      return (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(200)} style={styles.emptyWrap}>
          <View style={[styles.emptyIconCircle, { backgroundColor: LIGHT.dangerLight, borderColor: LIGHT.dangerMid }]}>
            <Ionicons name="alert-circle-outline" size={28} color={LIGHT.danger} />
          </View>
          <Text style={styles.emptyTitle}>Failed to load data</Text>
          <Text style={styles.emptySubtitle}>Something went wrong while fetching inventory. Please check your connection.</Text>
          <TouchableOpacity
            style={[styles.shortbookBtn, { minWidth: 120, marginTop: SPACING.md }]}
            onPress={() => refetch()}
            activeOpacity={0.88}
          >
            <Text style={styles.shortbookBtnText}>Retry</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    }
    const copy: Record<number, { title: string; sub: string; icon: keyof typeof Ionicons.glyphMap }> = {
      0: { title: 'No medicines found', sub: 'Try another search, or add a new product to your catalog.', icon: 'search-outline' },
      1: { title: 'Stock looks healthy', sub: 'Nothing below reorder level right now. Great work!', icon: 'checkmark-circle-outline' },
      2: { title: 'No expiring batches', sub: 'Nothing in the next 90 days needs attention.', icon: 'shield-checkmark-outline' },
    };
    const c = copy[tab];
    return (
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(200)} style={styles.emptyWrap}>
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
      <Animated.View >
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
      <Animated.View >
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
      <GlassMeshBackground />


      {/* ── Header ── */}
      <WorkspaceHeader title="Inventory" icon="cube-outline" subtitle="Medicines, batches and expiry dates" safeArea>
        <WorkspaceSearch label="Search medicines" value={search} onChangeText={handleSearch} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{([
          { key: 'all', label: 'All medicines' }, { key: 'low_stock', label: 'Low stock' }, { key: 'expiring', label: 'Expiring' }, { key: 'schedule_h1', label: 'Schedule H1' },
        ] as const).map(filter => <WorkspaceChip key={filter.key} label={filter.label} selected={selectedChip === filter.key} onPress={() => handleChipPress(filter.key)} />)}</ScrollView>
        {summaryData && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Text style={{ color: LIGHT.textSecondary, fontSize: 12 }}>{summaryData.totalProducts} medicines</Text><Text style={{ color: LIGHT.textSecondary, fontSize: 12 }}>· {formatCurrency(summaryData.totalStockValue)} stock value</Text></View>}
      </WorkspaceHeader>

      {/* ── List ── */}
      {activeTab === 0 && (
        <FlashList
              key={layout.listColumns}
              numColumns={layout.listColumns}
          data={processedAllMedicines}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item, index = 0 }: { item: Medicine; index?: number }) =>
            renderMedicineCard(item, false, index)
          }
          ListHeaderComponent={() =>
            (processedAllMedicines?.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>{processedAllMedicines?.length} results</Text>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: layout.scrollBottom }]}
          ListEmptyComponent={() => listEmpty(isLoading, isError, 0)}
        />
      )}

      {activeTab === 1 && (
        <FlashList
              key={layout.listColumns}
              numColumns={layout.listColumns}
          data={processedLowStock}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item, index = 0 }: { item: Medicine; index?: number }) =>
            renderMedicineCard(item, true, index)
          }
          ListHeaderComponent={() =>
            (processedLowStock?.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>{processedLowStock?.length} items below reorder level</Text>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: layout.scrollBottom }]}
          ListEmptyComponent={() => listEmpty(isLoading, isError, 1)}
        />
      )}

      {activeTab === 2 && (
        <FlashList
              key={layout.listColumns}
              numColumns={layout.listColumns}
          data={processedExpiringBatches}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item, index = 0 }: { item: MedicineBatch; index?: number }) =>
            renderExpiringCard(item, index)
          }
          ListHeaderComponent={() =>
            (processedExpiringBatches?.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>{processedExpiringBatches?.length} batches expiring in 90 days</Text>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: layout.scrollBottom }]}
          ListEmptyComponent={() => listEmpty(isLoading, isError, 2)}
        />
      )}

      {/* ── FAB ── */}
      <WorkspaceFab label="Add medicine" onPress={() => router.push('/(app)/inventory/add')} bottom={layout.scrollBottom} />
    </View>
  );
}