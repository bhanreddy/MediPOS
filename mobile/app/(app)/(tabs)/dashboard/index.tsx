import { AppText as Text } from '@/components/ui/AppText';
import { useIsFocused } from '@react-navigation/native';
import { mobileLayout } from '@/theme/mobileLayout';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Line,
  Circle,
} from 'react-native-svg';
import { format, formatDistanceToNow } from 'date-fns';
import { useTheme } from '@/hooks/useTheme';
import { brandBlue, nexsyPaletteFor } from '@/theme/nexsyrus';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { ScrollReveal, RevealViewportContext } from '@/components/dashboard/ScrollReveal';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { useDashboardData } from '@/hooks/useDashboard';
import { useRevenueTrend } from '@/hooks/useAnalytics';
import {
  useGlassPreferences,
  type LiquidPalette,
} from '@/components/glass/LiquidGlass';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const money = (n: number) => currencyFormatter.format(n || 0);
type Icon = keyof typeof Ionicons.glyphMap;
const go = (path: string) => router.push(path as never);
const newSale = () => router.replace('/(app)/(tabs)/pos');
function Symbol({
  icon,
  palette,
  color,
}: {
  icon: Icon;
  palette: LiquidPalette;
  color?: string;
}) {
  return (
    <View style={[s.symbol, { backgroundColor: color ? `${color}16` : palette.soft }]}>
      <Ionicons name={icon} size={21} color={color || palette.accent} />
    </View>
  );
}
function SectionTitle({
  eyebrow,
  title,
  palette,
  children,
}: React.PropsWithChildren<{
  eyebrow?: string;
  title: string;
  palette: LiquidPalette;
}>) {
  return (
    <View style={s.sectionTitle}>
      <View style={s.flex}>
        {eyebrow && <Text style={[s.eyebrow, { color: palette.muted }]}>{eyebrow}</Text>}
        <Text style={[s.sectionName, { color: palette.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
function RevenueChart({
  rows,
  palette,
  selected,
  onSelect,
}: {
  rows: { date: string; revenue: number }[];
  palette: LiquidPalette;
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const [width, setWidth] = useState(300);
  const height = 130,
    left = 6,
    right = width - 6,
    top = 12,
    bottom = height - 12;
  const { points, path } = useMemo(() => {
  const max = Math.max(...rows.map((r) => r.revenue), 1) * 1.12;
  const points = rows.map((r, i) => ({
    x: left + ((right - left) * i) / Math.max(rows.length - 1, 1),
    y: bottom - (r.revenue / max) * (bottom - top),
  }));
  // Horizontal cubic tangents keep the curve between neighbouring revenue values.
  const path = points
    .map((point, i) => {
      if (!i) return `M ${point.x} ${point.y}`;
      const prev = points[i - 1],
        mid = (prev.x + point.x) / 2;
      return `C ${mid} ${prev.y}, ${mid} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(' ');
    return { points, path };
  }, [rows, width]);
  const active = selected === null ? undefined : points[selected];
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Revenue chart"
        accessibilityValue={{
          text:
            selected === null
              ? 'Select a day to inspect revenue'
              : `${rows[selected]?.date}, ${money(rows[selected]?.revenue || 0)}`,
        }}
        accessibilityActions={[
          { name: 'increment', label: 'Next day' },
          { name: 'decrement', label: 'Previous day' },
        ]}
        onAccessibilityAction={(event) =>
          onSelect(
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                (selected ?? rows.length - 1) +
                  (event.nativeEvent.actionName === 'increment' ? 1 : -1),
              ),
            ),
          )
        }
        onPress={(event) =>
          onSelect(
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round(
                  ((event.nativeEvent.locationX - left) / (right - left)) *
                    (rows.length - 1),
                ),
              ),
            ),
          )
        }
      >
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.accent} stopOpacity="0.28" />
              <Stop offset="1" stopColor={palette.accent} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {[top + 10, (top + bottom) / 2, bottom].map((y) => (
            <Line
              key={y}
              x1={left}
              x2={right}
              y1={y}
              y2={y}
              stroke={palette.grid}
              strokeDasharray="3 6"
            />
          ))}
          {points.length > 0 && (
            <>
              <Path
                d={`${path} L ${points[points.length - 1].x} ${bottom} L ${left} ${bottom} Z`}
                fill="url(#revenueGradient)"
              />
              <Path
                d={path}
                stroke={palette.accent}
                strokeWidth={2.5}
                fill="none"
              />
            </>
          )}
          {active && (
            <>
              <Line
                x1={active.x}
                x2={active.x}
                y1={top}
                y2={bottom}
                stroke={palette.muted}
                strokeDasharray="3 5"
              />
              <Circle
                cx={active.x}
                cy={active.y}
                r={5}
                fill={palette.accent}
                stroke={palette.solid}
                strokeWidth={3}
              />
            </>
          )}
        </Svg>
      </Pressable>
      <View style={s.chartLabels}>
        {[0, Math.floor((rows.length - 1) / 2), rows.length - 1].map(
          (i, key) => (
            <Text key={key} style={[s.tiny, { color: palette.muted }]}>
              {rows[i]
                ? format(new Date(`${rows[i].date}T12:00:00`), 'dd MMM')
                : ''}
            </Text>
          ),
        )}
      </View>
    </View>
  );
}
function DashboardContent() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { reduceMotion } = useGlassPreferences();
  const p = nexsyPaletteFor(isDark),
    successColor = theme.colors.success,
    insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const { wide } = layout;
  const scrollTop = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const revealViewport = useMemo(() => ({ top: scrollTop, height: viewportHeight, inset: insets.top + 12 }), [scrollTop, viewportHeight, insets.top]);
  const scrollHandler = useAnimatedScrollHandler(event => { scrollTop.value = event.contentOffset.y; });
  const user = useAuthStore((state) => state.user);
  const focused = useIsFocused();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => { if (!focused) setNotificationsOpen(false); }, [focused]);
  const dashboard = useDashboardData(focused);
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const [selected, setSelected] = useState<number | null>(null);
  const trend = useRevenueTrend('daily', String(range), focused);
  const [refreshing, setRefreshing] = useState(false);
  const data = dashboard.data,
    unavailable = dashboard.isError && !data;
  const value = (amount: number | undefined) =>
    dashboard.isLoading || unavailable ? '—' : money(amount || 0);
  const bills = data?.today_bills || 0;
  const recentCustomers = [...new Set((data?.recent_activity ?? []).map(sale => sale.customer_name?.trim()).filter((name): name is string => Boolean(name)))].slice(0, 3);
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours(),
    greeting =
      hour < 12
        ? 'Good morning'
        : hour < 17
          ? 'Good afternoon'
          : 'Good evening';
  const trendRows = trend.data;
  const chartDateKey = new Date().toISOString().slice(0, 10);
  const chart = useMemo(() => {
    if (!trendRows) return [];
    const byDay = new Map(
      trendRows.map((row) => [row.date.slice(0, 10), row.revenue]),
    );
    return Array.from({ length: range }, (_, i) => {
      // The analytics endpoint buckets daily sales in UTC.
      const date = new Date(
        Date.parse(`${chartDateKey}T00:00:00Z`) - (range - i - 1) * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      return { date, revenue: byDay.get(date) || 0 };
    });
  }, [trendRows, range, chartDateKey]);
  const selectedDay = selected === null ? undefined : chart[selected];
  const trendTotal = chart.reduce((sum, row) => sum + row.revenue, 0);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([dashboard.refetch(), trend.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  const alertTotal =
    (data?.low_stock_count || 0) +
    (data?.expiry_count_30d || 0) +
    (data?.shortbook_count || 0);
  const attention: {
    label: string;
    hint: string;
    count: number;
    icon: Icon;
    color: string;
    action: () => void;
  }[] = [
    {
      label: 'Low stock',
      hint: 'Medicines to replenish',
      count: data?.low_stock_count || 0,
      icon: 'cube-outline',
      color: p.amber,
      action: () =>
        router.push({
          pathname: '/(app)/(tabs)/inventory',
          params: { filter: 'low_stock' },
        }),
    },
    {
      label: 'Expiring soon',
      hint: 'Batches within 30 days',
      count: data?.expiry_count_30d || 0,
      icon: 'time-outline',
      color: p.rose,
      action: () =>
        router.push({
          pathname: '/(app)/(tabs)/inventory',
          params: { filter: 'expiring' },
        }),
    },
    {
      label: 'Reorder queue',
      hint: 'Items in your shortbook',
      count: data?.shortbook_count || 0,
      icon: 'list-outline',
      color: p.accent,
      action: () => go('/(app)/shortbook'),
    },
  ];
  return (
    <View testID="dashboard-screen" style={[s.screen, { backgroundColor: p.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <RevealViewportContext.Provider value={revealViewport}>
      <Animated.ScrollView testID="dashboard-scroll"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onLayout={event => { viewportHeight.value = event.nativeEvent.layout.height; }}
        contentContainerStyle={[
          s.scroll,
          { paddingHorizontal: layout.gutter, paddingTop: insets.top + 12, paddingBottom: layout.scrollBottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={p.accent}
            colors={[p.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.content, { maxWidth: layout.contentWidth }]}>
          <View style={s.topLine}>
            <View style={s.brand}>
              <Text style={[s.star, { color: p.accent }]}>✳</Text>
              <Text style={[s.eyebrow, { color: p.muted }]}>
                YOUR PHARMACY
              </Text>
            </View>
            <View style={s.topActions}>
              <DashboardPanel style={s.roundControl}><Pressable accessibilityRole="button" accessibilityLabel="Open notifications" onPress={() => setNotificationsOpen(true)} style={s.controlPress}>
                <Ionicons name="notifications-outline" size={19} color={p.text} />
                {alertTotal > 0 && <View style={s.bellCount}><Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>{alertTotal > 99 ? '99+' : alertTotal}</Text></View>}
              </Pressable></DashboardPanel>
              <DashboardPanel style={s.roundControl}>
                <Pressable
                  style={s.controlPress}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isDark ? 'Use light appearance' : 'Use dark appearance'
                  }
                  onPress={toggleTheme}
                >
                  <Ionicons
                    name={isDark ? 'sunny-outline' : 'moon-outline'}
                    size={19}
                    color={p.text}
                  />
                </Pressable>
              </DashboardPanel>
              <DashboardPanel style={s.roundControl}>
                <Pressable
                  style={s.controlPress}
                  accessibilityRole="button"
                  accessibilityLabel="Open settings"
                  onPress={() => go('/(app)/settings')}
                >
                  <Ionicons name="person-outline" size={19} color={p.text} />
                </Pressable>
              </DashboardPanel>
            </View>
          </View>
          <Text style={[s.greeting, { color: p.text, fontSize: layout.compact ? 23 : 28, lineHeight: layout.compact ? 30 : 36 }]}>
            {greeting},{' '}
            <Text style={{ fontWeight: '600' }}>{firstName}.</Text>
          </Text>

          {!dashboard.isLoading && !unavailable && alertTotal > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${alertTotal} inventory items need attention. Open inventory.`}
              onPress={() =>
                router.push({
                  pathname: '/(app)/(tabs)/inventory',
                  params: { filter: 'low_stock' },
                })
              }
              style={[
                s.alertBanner,
                { backgroundColor: `${p.amber}14`, borderColor: `${p.amber}55` },
              ]}
            >
              <Ionicons name="warning-outline" size={18} color={p.amber} />
              <Text style={[s.alertBannerText, { color: p.text }]}>
                <Text style={{ fontWeight: '700' }}>
                  {alertTotal.toLocaleString('en-IN')}
                </Text>{' '}
                inventory {alertTotal === 1 ? 'item needs' : 'items need'} your
                attention
              </Text>
              <Ionicons name="chevron-forward" size={16} color={p.muted} />
            </Pressable>
          )}
          {dashboard.isError && (
            <View
              accessibilityRole="alert"
              style={[
                s.error,
                { backgroundColor: p.solid, borderColor: p.grid },
              ]}
            >
              <Text style={{ color: p.text, flex: 1, fontSize: 13 }}>
                {data
                  ? 'Couldn’t refresh. Your last available figures are shown.'
                  : 'Your dashboard couldn’t load. Please try again.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onRefresh}
                style={s.retry}
              >
                <Text style={{ color: p.accent, fontWeight: '600' }}>
                  Retry
                </Text>
              </Pressable>
            </View>
          )}
          <ScrollReveal testID="dashboard-section">
            <DashboardPanel testID="dashboard-revenue" material="hero" style={[s.hero, { padding: layout.compact ? 20 : 24 }]}>
              <View style={s.heroHeader}>
                <Text style={[s.eyebrow, { color: '#E1EAFF' }]}>
                  TODAY AT A GLANCE
                </Text>
                <View style={s.heroDate}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>{format(new Date(), 'dd MMM yyyy')}</Text></View>
              </View>
              <View style={[s.heroBody, wide && s.horizontal]}>
              <View style={wide && s.flex}>
              <Text style={[s.revenueLabel, { color: '#E1EAFF' }]}>
                Today’s revenue
              </Text>
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                style={[s.revenue, { color: '#FFFFFF', fontSize: wide ? 64 : layout.compact ? 42 : 50 }]}
              >
                {value(data?.today_revenue)}
              </Text>
              </View>
              <View style={[s.heroFooter, (layout.compact || layout.largeText) && { flexDirection: 'column', alignItems: 'stretch' }, wide && { flex: 1, paddingLeft: 24, paddingTop: 0, borderTopWidth: 0, borderLeftWidth: 1 }]}>
              <View style={[s.heroStats, { borderColor: '#FFFFFF40', borderTopWidth: 0, paddingTop: 0, marginTop: 0, flex: 1 }, layout.largeText && { flexDirection: 'column' }]}>
                <View style={s.flex}>
                  <Text style={[s.tiny, { color: '#E1EAFF', fontSize: 10 }]}>
                    Invoices created
                  </Text>
                  <Text style={[s.statValue, { color: '#FFFFFF' }]}>
                    {dashboard.isLoading || unavailable
                      ? '—'
                      : bills.toLocaleString('en-IN')}{' '}
                    <Text style={[s.tiny, { color: '#E1EAFF', fontSize: 10 }]}>bills</Text>
                  </Text>
                </View>
                <View style={s.flex}>
                  <Text style={[s.tiny, { color: '#E1EAFF', fontSize: 10 }]}>Average bill</Text>
                  <Text
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    style={[s.statValue, { color: '#FFFFFF' }]}
                  >
                    {value(bills ? (data?.today_revenue || 0) / bills : 0)}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New sale"
                onPress={newSale}
                style={({ pressed }) => [
                  s.primary,
                  (layout.compact || layout.largeText) && { alignSelf: 'flex-start' },
                  {
                    backgroundColor: '#FFFFFF',
                    transform: [{ scale: pressed && !reduceMotion ? 0.98 : 1 }],
                  },
                ]}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={21}
                  color={brandBlue}
                />
                <Text style={[s.primaryText, { color: brandBlue }]}>
                  New sale
                </Text>
                <Ionicons
                  name="arrow-up-outline"
                  size={19}
                  color={brandBlue}
                  style={{ transform: [{ rotate: '45deg' }] }}
                />
              </Pressable>
              </View>
              </View>
              <View pointerEvents="none" style={[s.heroNotch, { left: -10, backgroundColor: p.background }]} />
              <View pointerEvents="none" style={[s.heroNotch, { right: -10, backgroundColor: p.background }]} />
            </DashboardPanel>
          </ScrollReveal>
          <ScrollReveal testID="dashboard-section" style={[s.overview, wide && s.horizontal]}>
            <DashboardPanel testID="dashboard-report" style={[s.chartPanel, wide && s.flex]}>
              <SectionTitle
                title={range === 7 ? "Weekly report" : "Revenue report"}
                palette={p}
              >
              <View style={[s.segments, { backgroundColor: p.soft }]}>
                {([7, 30, 90] as const).map((days) => (
                  <Pressable
                    key={days}
                    onPress={() => {
                      setRange(days);
                      setSelected(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${days} days`}
                    accessibilityState={{ selected: range === days }}
                    style={[
                      s.segment,
                      range === days && {
                        backgroundColor: p.solid,
                        borderColor: p.edge,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.segmentText,
                        { color: range === days ? p.text : p.muted },
                      ]}
                    >
                      {days}D
                    </Text>
                  </Pressable>
                ))}
              </View>
              </SectionTitle>
              <Text
                accessibilityLiveRegion="polite"
                style={[s.chartAmount, { color: p.text }]}
              >
                {trend.isLoading || (trend.isError && !trend.data)
                  ? '—'
                  : money(selectedDay?.revenue ?? trendTotal)}
              </Text>
              <Text style={[s.tiny, { color: p.muted, marginBottom: 8 }]}>
                {selectedDay
                  ? format(
                      new Date(`${selectedDay.date}T12:00:00`),
                      'EEEE, dd MMM',
                    )
                  : `Last ${range} days · tap the chart to explore`}
              </Text>
              {trend.isLoading ? (
                <View style={s.chartPlaceholder}>
                  <ActivityIndicator color={p.accent} />
                </View>
              ) : trend.isError && !trend.data ? (
                <Pressable
                  style={s.chartPlaceholder}
                  accessibilityRole="button"
                  accessibilityLabel="Retry revenue chart"
                  onPress={() => trend.refetch()}
                >
                  <Ionicons name="refresh-outline" color={p.accent} size={24} />
                  <Text style={{ color: p.muted, fontSize: 12 }}>
                    Couldn’t load revenue. Tap to retry.
                  </Text>
                </Pressable>
              ) : (
                <RevenueChart
                  rows={chart}
                  palette={p}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
              {trend.isError && trend.data && (
                <Text style={[s.tiny, { color: p.amber }]}>
                  Showing your last available chart.
                </Text>
              )}
            </DashboardPanel>
            <View style={[s.utilities, wide && s.flex]}>
          <View testID="dashboard-financials" style={[s.metricGrid, layout.compact && { flexDirection: 'column' }]}>
            {[
              {
                label: 'To collect',
                hint: 'From customers',
                value: data?.outstanding_receivable,
                icon: 'arrow-down-outline' as Icon,
                path: '/(app)/(tabs)/patients',
                tone: 'violet' as const,
                color: p.violet,
              },
              {
                label: 'To pay',
                hint: 'To suppliers',
                value: data?.outstanding_payable,
                icon: 'arrow-up-outline' as Icon,
                path: '/(app)/suppliers',
                tone: 'amber' as const,
                color: p.amber,
              },
            ].map((metric) => (
              <DashboardPanel key={metric.label} style={s.flex}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${metric.label}, ${value(metric.value)}. ${metric.hint}`}
                  style={s.metric}
                  onPress={() => go(metric.path)}
                >
                  <View style={s.metricHeading}>
                    <Ionicons name={metric.icon} size={18} color={metric.color} />
                    <Ionicons
                      name="arrow-forward-outline"
                      size={15}
                      color={p.muted}
                      style={{ transform: [{ rotate: '-45deg' }] }}
                    />
                  </View>
                  <Text style={[s.metricLabel, { color: p.muted }]}>
                    {metric.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[s.metricValue, { color: p.text }]}
                  >
                    {value(metric.value)}
                  </Text>
                </Pressable>
              </DashboardPanel>
            ))}
          </View>
          <View style={s.actionHeading}>
            <Text style={[s.sectionName, { color: p.text }]}>
              Quick actions
            </Text>
          </View>
          <View testID="dashboard-actions"><DashboardPanel style={s.quickActions}>
            {[
              {
                label: 'Invoice',
                icon: 'receipt-outline' as Icon,
                action: newSale,
              },
              {
                label: 'Stock',
                icon: 'cube-outline' as Icon,
                action: () => go('/(app)/(tabs)/inventory'),
              },
              {
                label: 'Patients',
                color: p.violet,
                icon: 'people-outline' as Icon,
                action: () => go('/(app)/(tabs)/patients'),
              },
              {
                label: 'Reports',
                color: p.amber,
                icon: 'pie-chart-outline' as Icon,
                action: () => go('/(app)/reports'),
              },
            ].map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={action.action}
                style={[s.quickAction, { backgroundColor: p.soft, borderColor: p.edge }, layout.largeText && { flexBasis: '100%' }]}
              >
                <Symbol icon={action.icon} palette={p} color={action.color} />
                <Text style={[s.actionLabel, { color: p.text }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </DashboardPanel></View>
            </View>
          </ScrollReveal>
          <ScrollReveal testID="dashboard-section" style={[s.overview, wide && s.horizontal, wide && { alignItems: 'flex-start' }]}>
            <DashboardPanel style={[s.listPanel, wide && s.flex]}>
              {!!recentCustomers.length && <View style={s.customerStack}>{recentCustomers.map((name, index) => <View key={name} style={[s.customerAvatar, { marginLeft: index ? -8 : 0, borderColor: p.solid, backgroundColor: index === 2 ? brandBlue : p.soft }]}><Text style={{ color: index === 2 ? '#FFFFFF' : p.accent, fontSize: 9, fontWeight: '600' }}>{name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</Text></View>)}</View>}
              <SectionTitle
                title="Recent sales"
                palette={p}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => go('/(app)/(tabs)/sales')}
                  style={s.seeAll}
                >
                  <Text
                    style={{ fontSize: 12, color: p.accent, fontWeight: '600' }}
                  >
                    See all
                  </Text>
                  <Ionicons name="arrow-forward" size={15} color={p.accent} />
                </Pressable>
              </SectionTitle>
              {dashboard.isLoading ? (
                <ActivityIndicator style={{ padding: 35 }} color={p.accent} />
              ) : data?.recent_activity?.length ? (
                data.recent_activity.slice(0, 5).map((sale, i) => (
                  <Pressable
                    key={sale.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/sales/[id]',
                        params: { id: sale.id },
                      })
                    }
                    style={[
                      s.listRow,
                      i > 0 && { borderTopWidth: 1, borderColor: p.grid },
                    ]}
                  >
                    <Symbol
                      icon={
                        sale.is_return
                          ? 'return-down-back-outline'
                          : 'receipt-outline'
                      }
                      palette={p}
                    />
                    <View style={s.flex}>
                      <Text
                        numberOfLines={1}
                        style={[s.rowTitle, { color: p.text }]}
                      >
                        {sale.invoice_number || 'Invoice'}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[s.rowHint, { color: p.muted }]}
                      >
                        {sale.customer_name || 'Walk-in customer'}
                        {sale.date
                          ? ` · ${formatDistanceToNow(new Date(sale.date), { addSuffix: true })}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', maxWidth: '40%' }}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={[
                          s.saleAmount,
                          { color: sale.is_return ? p.rose : p.text },
                        ]}
                      >
                        {sale.is_return ? '−' : ''}
                        {money(Math.abs(sale.net_amount))}
                      </Text>
                      <Text style={[s.payment, { color: p.muted }]}>
                        {sale.is_return
                          ? 'Return'
                          : sale.payment_mode || 'Sale'}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={p.muted}
                    />
                  </Pressable>
                ))
              ) : (
                <View style={s.empty}>
                  <Ionicons name="receipt-outline" size={28} color={p.accent} />
                  <Text style={[s.rowTitle, { color: p.text }]}>
                    {unavailable ? 'Sales are unavailable.' : 'No sales yet'}
                  </Text>
                  <Text style={[s.rowHint, { color: p.muted }]}>
                    {unavailable
                      ? 'Pull down to try again.'
                      : 'Your latest sales will appear here.'}
                  </Text>
                </View>
              )}
            </DashboardPanel>
            <DashboardPanel style={[s.listPanel, wide && s.flex]}>
              <SectionTitle
                title="Stock alerts"
                palette={p}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={23}
                  color={p.accent}
                />
              </SectionTitle>
              <View style={[s.stockLayout, layout.largeText && { flexDirection: 'column' }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Open inventory overview" onPress={() => go('/(app)/(tabs)/inventory')} style={[s.stockVisual, { backgroundColor: p.soft, borderColor: p.edge }]}>
                <Image source={require('../../../../assets/images/login-medical-products-realistic.png')} resizeMode="contain" style={s.stockImage} accessibilityIgnoresInvertColors />
                <View style={s.stockCaption}><Text style={{ color: '#FFFFFF', flex: 1, fontSize: 10, fontWeight: '600' }}>Inventory overview</Text><Ionicons name="arrow-up-outline" size={15} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} /></View>
              </Pressable>
              <View style={s.stockTiles}>
              {attention.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}, ${dashboard.isLoading || unavailable ? 'unavailable' : item.count}. ${item.hint}`}
                  key={item.label}
                  onPress={item.action}
                  style={[
                    s.stockTile, { backgroundColor: p.solid, borderColor: p.edge },
                  ]}
                >
                  <View style={s.flex}>
                    <Text style={[s.rowTitle, { color: p.text, fontSize: 11 }]}>
                      {item.label}
                    </Text>
                  </View>
                  <View
                    style={[
                      s.count,
                      {
                        backgroundColor:
                          !dashboard.isLoading &&
                          !unavailable &&
                          item.count > 0
                            ? `${item.color}22`
                            : p.soft,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: item.color,
                        fontSize: 14,
                        fontWeight: item.count > 0 ? '700' : '500',
                        opacity:
                          !dashboard.isLoading && !unavailable && item.count === 0
                            ? 0.55
                            : 1,
                      }}
                    >
                      {dashboard.isLoading || unavailable ? '—' : item.count}
                    </Text>
                  </View>
                </Pressable>
              ))}
              </View>
              </View>
              <View style={[s.attentionNote, { backgroundColor: p.soft }]}>
                <View
                  style={[
                    s.statusDot,
                    {
                      backgroundColor:
                        alertTotal === 0 && !dashboard.isLoading && !unavailable
                          ? successColor
                          : p.accent,
                    },
                  ]}
                />
                <Text style={[s.tiny, { color: p.muted }]}>
                  {dashboard.isLoading || unavailable
                    ? 'Review stock and expiry dates.'
                    : alertTotal === 0
                      ? 'Stock is up to date.'
                      : 'Review stock and expiry dates.'}
                </Text>
              </View>
            </DashboardPanel>
          </ScrollReveal>
          <ScrollReveal testID="dashboard-brand">
            <DashboardPanel material="hero" style={s.brandPanel}>
              <View style={[s.brandPanelTop, wide && s.horizontal]}>
                <View style={s.brandPanelLabel}><Ionicons name="add" size={24} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>Pharmacy workspace</Text></View>
                <View style={[s.brandTools, wide && { flex: 1, maxWidth: 360 }, layout.largeText && { flexWrap: 'wrap' }]}>{[
                  { label: 'Purchases', path: '/(app)/purchases' },
                  { label: 'Reorder', path: '/(app)/shortbook' },
                  { label: 'Reports', path: '/(app)/reports' },
                ].map(tool => <Pressable key={tool.label} accessibilityRole="button" accessibilityLabel={tool.label} onPress={() => go(tool.path)} style={s.brandTool}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>{tool.label}</Text><Ionicons name="arrow-forward" size={12} color="#FFFFFF" /></Pressable>)}</View>
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[s.wordmark, { fontSize: Math.min(layout.contentWidth * .23, 150), fontFamily: theme.typography.family.bold, letterSpacing: -Math.min(layout.contentWidth * .23, 150) * .045 }]}>nexsyrus</Text>
            </DashboardPanel>
          </ScrollReveal>
        </View>
      </Animated.ScrollView>
      </RevealViewportContext.Provider>
      <Modal visible={notificationsOpen} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setNotificationsOpen(false)}>
        <View style={[s.notificationRoot, { paddingTop: insets.top + 64 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setNotificationsOpen(false)} style={[StyleSheet.absoluteFill, { backgroundColor: '#14213A24' }]} />
          <View testID="notification-panel" accessibilityViewIsModal style={[s.notificationPanel, { backgroundColor: p.solid, borderColor: p.edge, maxHeight: Math.max(0, height - insets.top - insets.bottom - 84), width: Math.min(width - 24, 360) }]}>
            <View style={[s.notificationHeader, { borderColor: p.edge }]}><Ionicons name="notifications-outline" size={18} color={p.accent} /><Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontSize: 14, fontWeight: '600' }}>Notifications</Text><Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setNotificationsOpen(false)} style={s.notificationClose}><Ionicons name="close" size={19} color={p.muted} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {dashboard.isLoading ? <ActivityIndicator accessibilityLabel="Loading notifications" color={p.accent} style={{ padding: 24 }} /> : unavailable ? <Pressable accessibilityRole="button" onPress={onRefresh} style={[s.notificationRow, { borderColor: p.edge }]}><Text style={{ color: p.muted, fontSize: 12 }}>Notifications couldn’t load. Tap to retry.</Text></Pressable> : attention.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.count}`} onPress={() => { setNotificationsOpen(false); item.action(); }} style={[s.notificationRow, { borderColor: p.edge }]}>
                <View style={[s.notificationIcon, { backgroundColor: `${item.color}12` }]}><Ionicons name={item.icon} size={18} color={item.color} /></View>
                <View style={{ flex: 1 }}><Text style={{ color: p.text, fontSize: 12, fontWeight: '600' }}>{item.label}</Text><Text style={{ color: p.muted, fontSize: 11, lineHeight: 17, marginTop: 3 }}>{item.count ? `${item.count} ${item.count === 1 ? 'item needs' : 'items need'} attention` : 'You’re all up to date'}</Text></View>
                {!!item.count && <View style={s.notificationCount}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>{item.count > 99 ? '99+' : item.count}</Text></View>}<Ionicons name="chevron-forward" size={13} color={p.muted} />
              </Pressable>)}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
export default function DashboardScreen() {
  return <DashboardContent />;
}
const s = StyleSheet.create({
  bellCount: { position: 'absolute', right: 1, top: 1, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, backgroundColor: '#B63D60', alignItems: 'center', justifyContent: 'center' },
  notificationRoot: { flex: 1, alignItems: 'flex-end', paddingHorizontal: 12, paddingBottom: 20 },
  notificationPanel: { borderWidth: 1, borderColor: '#E4E9F2', borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 15, paddingRight: 5, borderBottomWidth: 1, borderColor: '#E4E9F2', minHeight: 54 },
  notificationClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notificationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 15, borderBottomWidth: 1, borderColor: '#EDF0F5' },
  notificationIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  notificationCount: { backgroundColor: '#2457E6', borderRadius: 12, minWidth: 21, height: 21, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  content: { width: '100%', alignSelf: 'center', gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', gap: 7, alignItems: 'center', flex: 1, minWidth: 0 },
  star: { fontSize: 24 },
  eyebrow: { flexShrink: 1, fontSize: 10, fontWeight: '600', letterSpacing: 1.3 },
  topActions: { flexDirection: 'row', gap: 8 },
  roundControl: { borderRadius: 14 },
  controlPress: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '400',
    letterSpacing: -1.3,
    marginTop: 5,
  },
  subtitle: { fontSize: 13, lineHeight: 20, marginTop: -6 },
  dateLine: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    marginTop: -6,
    marginBottom: 5,
  },
  statusDot: { height: 5, width: 5, borderRadius: 3 },
  tiny: { fontSize: 11, lineHeight: 16 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  alertBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  error: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  retry: { padding: 8 },
  overview: { gap: 16 },
  horizontal: { flexDirection: 'row', alignItems: 'stretch' },
  hero: { padding: 22, borderRadius: 18 },
  heroBody: { gap: 14 },
  heroFooter: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, borderTopWidth: 1, borderColor: '#FFFFFF35', paddingTop: 14 },
  heroDate: { borderWidth: 1, borderColor: '#FFFFFF45', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10 },
  heroNotch: { position: 'absolute', top: '50%', width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  utilities: { gap: 12 },
  customerStack: { flexDirection: 'row', marginBottom: 8 },
  customerAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stockLayout: { flexDirection: 'row', gap: 10 },
  stockVisual: { flex: 1.1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#E4E9F2' },
  stockImage: { width: '100%', height: 160 },
  stockCaption: { minHeight: 40, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2457E6' },
  stockTiles: { flex: 1, gap: 8 },
  stockTile: { flex: 1, minHeight: 56, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#E4E9F2', borderRadius: 10 },
  brandPanel: { padding: 20, borderRadius: 16 },
  brandPanelTop: { justifyContent: 'space-between', gap: 14 },
  brandPanelLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandTools: { flexDirection: 'row', gap: 7 },
  brandTool: { flex: 1, minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#FFFFFF55', borderRadius: 24 },
  wordmark: { fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginTop: 16 },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  revenueLabel: { fontSize: 13, marginTop: 22 },
  revenue: { fontSize: 48, letterSpacing: -2, fontWeight: '500', marginTop: 5 },
  caption: { fontSize: 11, marginTop: 8 },
  heroStats: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '500',
    marginTop: 5,
    letterSpacing: -0.5,
  },
  primary: {
    minHeight: 44,
    marginTop: 0,
    alignSelf: 'flex-end',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    gap: 9,
  },
  primaryText: { fontSize: 12, fontWeight: '600' },
  chartPanel: { padding: 20, borderRadius: 14 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 17,
  },
  sectionName: {
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: -0.5,
    marginTop: 5,
  },
  segments: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    alignSelf: 'flex-start',
    marginBottom: 0,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 12, fontWeight: '600' },
  chartAmount: {
    fontSize: 27,
    fontWeight: '500',
    letterSpacing: -0.9,
    marginBottom: 4,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 7,
  },
  chartPlaceholder: {
    height: 175,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  metricGrid: { flexDirection: 'row', gap: 12 },
  metric: { padding: 16 },
  metricHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricLabel: { fontSize: 12, marginBottom: 5 },
  metricValue: {
    fontSize: 25,
    fontWeight: '500',
    letterSpacing: -0.8,
    marginBottom: 4,
  },
  actionHeading: { marginTop: 4, marginBottom: -2 },
  quickActions: {
    flexWrap: 'wrap',
    borderRadius: 14,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  quickAction: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E4E9F2',
    backgroundColor: '#F7F9FD',
    borderRadius: 24,
  },
  symbol: {
    height: 32,
    width: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 11, fontWeight: '500' },
  listPanel: { padding: 20, borderRadius: 14 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
  },
  rowTitle: { fontSize: 13, fontWeight: '600', letterSpacing: -0.15 },
  rowHint: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  count: {
    minWidth: 30,
    minHeight: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  attentionNote: {
    borderRadius: 14,
    padding: 12,
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
    paddingLeft: 8,
  },
  saleAmount: { fontSize: 13, fontWeight: '600' },
  payment: { fontSize: 9, marginTop: 4, textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
