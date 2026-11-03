import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceCard, WorkspaceFab, WorkspaceChip } from '@/components/ui/Workspace';
import { mobileLayout } from '@/theme/mobileLayout';
import { useGlassPreferences } from '@/components/glass/LiquidGlass';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { LiquidSheen } from '@/components/glass/LiquidGlass';
import { useRef, useState, useMemo, useEffect } from 'react';
import { useWindowDimensions, View, StyleSheet, ActivityIndicator, Animated, Alert, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';


import { useTheme } from '@/hooks/useTheme';
import { expensesApi, Expense, type ExpenseCategoryDb, type CreateExpenseBody } from '@/api/expenses';
import { formatCurrency, formatDate } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { useUIStore } from '@/stores/uiStore';

/** Labels for UI — values match backend `expense.schema` enum */
const CATEGORY_OPTIONS: { label: string; value: ExpenseCategoryDb }[] = [
  { label: 'Rent', value: 'rent' },
  { label: 'Salary', value: 'salary' },
  { label: 'Utilities', value: 'utilities' },
  { label: 'Supplies', value: 'supplies' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Other', value: 'misc' },
];

function expenseCategoryLabel(cat: ExpenseCategoryDb): string {
  return CATEGORY_OPTIONS.find((o) => o.value === cat)?.label ?? cat;
}

function getCategoryIcon(cat: ExpenseCategoryDb): keyof typeof Ionicons.glyphMap {
  switch (cat) {
    case 'rent': return 'business-outline';
    case 'salary': return 'people-outline';
    case 'utilities': return 'flash-outline';
    case 'supplies': return 'cube-outline';
    case 'maintenance': return 'construct-outline';
    default: return 'receipt-outline';
  }
}

export default function ExpensesIndexScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const addToast = useUIStore(s => s.addToast);
  const qc = useQueryClient();

  type PeriodType = 'all' | 'this_month' | 'last_month';

  const PERIOD_OPTIONS: { label: string; value: PeriodType }[] = [
    { label: 'All Periods', value: 'all' },
    { label: 'This Month', value: 'this_month' },
    { label: 'Last Month', value: 'last_month' },
  ];

  const [activePeriod, setActivePeriod] = useState<PeriodType>('all');

  const { from, to } = useMemo(() => {
    if (activePeriod === 'this_month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString(), to: now.toISOString() };
    }
    if (activePeriod === 'last_month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    return { from: undefined, to: undefined };
  }, [activePeriod]);

  const sheetRef = useRef<GorhomBottomSheet>(null);

  // Network state — expenses are real-time only, no offline save
  const [isOnline, setIsOnline] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);
  
  // Form State
  const [formCategory, setFormCategory] = useState<ExpenseCategoryDb>(CATEGORY_OPTIONS[0].value);
  const [formAmount, setFormAmount] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const { data: summary, isLoading: isLoadingSum } = useQuery({ queryKey: ['expenses-summary', from, to], queryFn: () => expensesApi.getExpenseSummary(from, to) });
  
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['expenses', from, to],
    queryFn: ({ pageParam = 1 }) => expensesApi.getExpenses({ from, to, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateExpenseBody) => expensesApi.createExpense(body),
    networkMode: 'online',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      addToast('Expense recorded', 'success');
      setSubmitError(null);
      sheetRef.current?.collapse();
      setFormAmount(''); setFormDesc('');
      setActivePeriod('all');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Could not save expense. Check connection and try again.';
      setSubmitError(msg);
      addToast('Expense not saved — check your connection', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      addToast('Expense removed', 'success');
    }
  });

  const { reduceMotion } = useGlassPreferences();
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = 0;
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, [summary, reduceMotion, progress]);

  const donutPaths = useMemo(() => {
    if (!summary || !summary.byCategory.length) return [];
    let startAngle = 0;
    const cx = 60, cy = 60, r = 40;
    const colors = [theme.colors.primary, theme.colors.accent, theme.colors.warning, theme.colors.danger, theme.colors.accent, theme.colors.primary];
    
    return summary.byCategory.map((item, i) => {
       const sweepAngle = (item.amount / summary.totalAmount) * 360;
       const path = Skia.Path.Make();
       path.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, startAngle, sweepAngle);
       startAngle += sweepAngle;
       return { path, color: colors[i % colors.length], ...item };
    });
  }, [summary, theme]);

  const submitExpense = async () => {
    // Pre-flight network check — expenses cannot be saved offline
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      setSubmitError('No internet connection. Expense cannot be saved offline.');
      addToast('No connection — expense not saved', 'error');
      return;
    }

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) return;
    setSubmitError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createMutation.mutate({
      category: formCategory,
      amount: amt,
      description: formDesc.trim() || undefined,
      expense_date: new Date().toISOString().split('T')[0],
      payment_mode: 'cash',
    });
  };

  const confirmDelete = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Remove Expense", "Are you sure you want to delete this expense record?", [
       { text: "Cancel", style: "cancel" },
       { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) }
    ]);
  };

  const renderRightActions = (prog: any, dragX: any, id: string) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    return (
      <TouchableOpacity style={[styles.swipeAction, { backgroundColor: theme.colors.danger }]} onPress={() => confirmDelete(id)}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash" size={24} color={theme.colors.text.inverse} />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const getCatColor = (cat: ExpenseCategoryDb) => {
    const idx = CATEGORY_OPTIONS.findIndex((o) => o.value === cat);
    return [theme.colors.primary, theme.colors.accent, theme.colors.warning, theme.colors.danger, theme.colors.accent, theme.colors.primary][Math.max(0, idx)];
  };

  const expenses = useMemo(() => data?.pages.flatMap(p => p.data) || [], [data]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <GlassMeshBackground />
      <WorkspaceHeader title="Expenses" icon="wallet-outline" subtitle={PERIOD_OPTIONS.find(o => o.value === activePeriod)?.label} onBack={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')} />

      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>{PERIOD_OPTIONS.map(opt => <WorkspaceChip key={opt.value} label={opt.label} selected={activePeriod === opt.value} onPress={() => { Haptics.selectionAsync(); setActivePeriod(opt.value); }} />)}</ScrollView>

      <View style={{ flex: 1 }}>
        <FlashListAny
              key={layout.listColumns}
              numColumns={layout.listColumns}
          data={expenses}
          keyExtractor={(i: Expense) => i.id}
          estimatedItemSize={68}
          contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 6, paddingBottom: insets.bottom + 88 }}
          ListHeaderComponent={
             summary && summary.totalAmount > 0 ? (
               <View style={[styles.donutCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
                  <View style={{ width: 120, height: 120, position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
                     <Canvas style={StyleSheet.absoluteFill}>
                       {donutPaths.map((d, i) => (
                         <Path key={i} path={d.path} color={d.color} style="stroke" strokeWidth={16} strokeCap="round" start={0} end={progress} />
                       ))}
                     </Canvas>
                     <View style={styles.donutCenterTextContainer}>
                        <Text style={[styles.donutCenterLabel, { color: theme.colors.text.secondary }]}>TOTAL</Text>
                        <Text style={[styles.donutCenterValue, { color: theme.colors.text.primary }]}>
                           {summary ? formatCurrency(summary.totalAmount).split('.')[0] : '...'}
                        </Text>
                     </View>
                  </View>
                  <View style={{ flex: 1, paddingLeft: 20, justifyContent: 'center', gap: 6 }}>
                     {donutPaths.map(d => (
                       <View key={d.category} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.color, marginRight: 8 }} />
                          <Text style={{ flex: 1, fontSize: 11, color: theme.colors.text.secondary }} numberOfLines={1}>
                             {expenseCategoryLabel(d.category)}
                          </Text>
                          <Text style={{ fontSize: 12, fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>
                             {formatCurrency(d.amount)}
                          </Text>
                       </View>
                     ))}
                  </View>
               </View>
             ) : null
          }
          renderItem={({ item }: { item: Expense }) => (
            <Swipeable renderRightActions={(p, d) => renderRightActions(p, d, item.id)} friction={2}>
              <WorkspaceCard style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <LiquidSheen dark={isDark} />
                <View style={[styles.iconCircle, { backgroundColor: getCatColor(item.category) + '15' }]}>
                  <Ionicons name={getCategoryIcon(item.category)} size={18} color={getCatColor(item.category)} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                   <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary, fontSize: 14 }}>
                      {item.description || expenseCategoryLabel(item.category)}
                   </Text>
                   <Text style={{ fontSize: 11, color: theme.colors.text.secondary, marginTop: 4 }}>{formatDate(item.date)}</Text>
                </View>
                <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 15, color: theme.colors.danger }}>
                   {formatCurrency(item.amount)}
                </Text>
              </WorkspaceCard>
            </Swipeable>
          )}
          onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
        />
      </View>

      <WorkspaceFab label="Log expense" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sheetRef.current?.expand(); }} bottom={insets.bottom + 20} />

      <BottomSheet ref={sheetRef} snapPoints={['65%']} title="Log Expense">
         <View style={{ flex: 1, justifyContent: 'space-between' }}>
            <ScrollView 
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
               {/* Category Grid Selection */}
               <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.semiBold, marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Category</Text>
               <View style={styles.catGrid}>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <TouchableOpacity 
                       key={opt.value}
                       style={[styles.catPill, { 
                         backgroundColor: formCategory === opt.value ? theme.colors.primary : theme.colors.surface,
                         borderColor: formCategory === opt.value ? theme.colors.primary : theme.colors.border
                       }]}
                       onPress={() => { Haptics.selectionAsync(); setFormCategory(opt.value); }}
                       activeOpacity={0.8}
                    >
                       <Ionicons 
                         name={getCategoryIcon(opt.value)} 
                         size={14} 
                         color={formCategory === opt.value ? theme.colors.text.inverse : theme.colors.text.secondary}
                       />
                       <Text style={{ 
                         color: formCategory === opt.value ? theme.colors.text.inverse : theme.colors.text.secondary,
                         fontFamily: formCategory === opt.value ? theme.typography.family.semiBold : theme.typography.family.regular,
                         fontSize: 12,
                         marginLeft: 6
                       }}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
               </View>

               {/* Inputs */}
               <View style={{ gap: 12, marginTop: 8 }}>
                  <FloatingInput label="Amount (₹) *" value={formAmount} onChangeText={setFormAmount} keyboardType="numeric" />
                  <FloatingInput label="Description (Optional)" value={formDesc} onChangeText={setFormDesc} />
               </View>

               {/* Error banner — keeps form open for retry */}
               {submitError && (
                 <View style={[styles.errorBanner, { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger + '40', marginTop: 12 }]}>
                   <Ionicons name="alert-circle" size={16} color={theme.colors.danger} />
                   <Text style={{ flex: 1, color: theme.colors.danger, fontSize: 13, marginLeft: 8 }}>{submitError}</Text>
                 </View>
               )}

               {/* Offline warning */}
               {!isOnline && (
                 <View style={[styles.errorBanner, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40', marginTop: 12 }]}>
                   <Ionicons name="cloud-offline" size={16} color="#F59E0B" />
                   <Text style={{ flex: 1, color: '#F59E0B', fontSize: 13, marginLeft: 8 }}>No internet connection. Expense cannot be saved offline.</Text>
                 </View>
               )}
            </ScrollView>

            {/* Fixed Footer Action Button */}
            <View style={[styles.sheetFooter, { borderTopColor: theme.colors.border }]}>
               <TouchableOpacity 
                 style={{ flex: 1 }}
                 disabled={!formAmount || createMutation.isPending || !isOnline}
                 onPress={submitExpense}
                 activeOpacity={0.8}
               >
                 <View style={[styles.submitBtn, { backgroundColor: theme.colors.primary, opacity: (!formAmount || !isOnline) ? 0.6 : 1 }]}>
                   {createMutation.isPending ? (
                     <ActivityIndicator color={theme.colors.text.inverse} />
                   ) : (
                     <Text style={{ color: (!formAmount || !isOnline) ? theme.colors.text.tertiary : theme.colors.text.inverse, fontFamily: theme.typography.family.bold, fontSize: 15 }}>
                       {isOnline ? 'Save Expense' : 'No Connection'}
                     </Text>
                   )}
                 </View>
               </TouchableOpacity>
            </View>
         </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    paddingBottom: 16, 
    borderBottomWidth: 0.5 
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  totalBadge: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  segmentContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    marginHorizontal: 6,
    marginTop: 14,
    marginBottom: 6,
    borderWidth: 1,
  },
  segmentButton: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  segmentButtonActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  donutCard: { 
    flexDirection: 'row', 
    alignItems: 'center',
    borderRadius: 18, 
    padding: 18, 
    marginHorizontal: 6,
    marginBottom: 20,
    borderWidth: 1,
  },
  donutCenterTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutCenterLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  donutCenterValue: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 1,
  },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderRadius: 16, 
    padding: 14, 
    marginHorizontal: 6,
    marginBottom: 10,
    borderWidth: 1,
  },
  iconCircle: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  swipeAction: { 
    justifyContent: 'center', 
    alignItems: 'flex-end', 
    width: 80, 
    borderRadius: 16, 
    marginBottom: 10, 
    marginRight: 16, 
    paddingHorizontal: 20 
  },
  fab: { 
    position: 'absolute', 
    bottom: 24, 
    right: 24, 
    width: 56, 
    height: 56, 
    borderRadius: 28, 
    overflow: 'hidden',
    elevation: 4,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  catPill: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12, 
    borderWidth: 1,
    width: '31%',
    justifyContent: 'center',
    marginBottom: 8,
  },
  submitBtn: { 
    minHeight: 48,
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  sheetFooter: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  errorBanner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    marginBottom: 12 
  }
});
