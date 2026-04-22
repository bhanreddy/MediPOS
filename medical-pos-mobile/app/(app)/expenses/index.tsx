import React, { useRef, useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, TextInput, ScrollView, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

export default function ExpensesIndexScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const addToast = useUIStore(s => s.addToast);
  const qc = useQueryClient();

  // Basic "Current Month" mapping
  const [from] = useState(new Date(new Date().setDate(1)).toISOString());
  const [to] = useState(new Date().toISOString());

  const sheetRef = useRef<GorhomBottomSheet>(null);
  
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      addToast('Expense recorded', 'success');
      sheetRef.current?.collapse();
      setFormAmount(''); setFormDesc('');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      addToast('Expense removed', 'success');
    }
  });

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [summary]);

  const donutPaths = useMemo(() => {
    if (!summary || !summary.byCategory.length) return [];
    let startAngle = 0;
    const cx = 60, cy = 60, r = 40;
    const colors = [theme.colors.primary, theme.colors.accent, theme.colors.warning, theme.colors.danger, '#8B5CF6', '#14B8A6'];
    
    return summary.byCategory.map((item, i) => {
       const sweepAngle = (item.amount / summary.totalAmount) * 360;
       const path = Skia.Path.Make();
       path.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, startAngle, sweepAngle);
       startAngle += sweepAngle;
       return { path, color: colors[i % colors.length], ...item };
    });
  }, [summary, theme]);

  const submitExpense = () => {
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) return;
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
          <Ionicons name="trash" size={24} color="#FFF" />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const getCatColor = (cat: ExpenseCategoryDb) => {
    const idx = CATEGORY_OPTIONS.findIndex((o) => o.value === cat);
    return [theme.colors.primary, theme.colors.accent, theme.colors.warning, theme.colors.danger, '#8B5CF6', '#14B8A6'][Math.max(0, idx)];
  };

  const expenses = useMemo(() => data?.pages.flatMap(p => p.data) || [], [data]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
         <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }} hitSlop={10}>
           <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
         </TouchableOpacity>
         <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontFamily: theme.typography.family.bold, color: theme.colors.text.primary }}>Expenses</Text>
            <Text style={{ fontSize: 13, color: theme.colors.text.secondary }}>This Month</Text>
         </View>
         <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 18, fontFamily: theme.typography.family.bold, color: theme.colors.primary }}>
               {summary ? formatCurrency(summary.totalAmount) : '...'}
            </Text>
         </View>
      </View>

      <View style={{ flex: 1 }}>
        <FlashListAny
          data={expenses}
          keyExtractor={(i: Expense) => i.id}
          estimatedItemSize={68}
          contentContainerStyle={{ paddingVertical: 12 }}
          ListHeaderComponent={
             summary && summary.totalAmount > 0 ? (
               <View style={[styles.donutCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
                  <View style={{ width: 120, height: 120 }}>
                     <Canvas style={{ flex: 1 }}>
                       {donutPaths.map((d, i) => (
                         <Path key={i} path={d.path} color={d.color} style="stroke" strokeWidth={16} strokeCap="round" start={0} end={progress} />
                       ))}
                     </Canvas>
                  </View>
                  <View style={{ flex: 1, paddingLeft: 24, justifyContent: 'center', gap: 6 }}>
                     {donutPaths.map(d => (
                       <View key={d.category} style={{ flexDirection: 'row', alignItems: 'center' }}>
                         <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color, marginRight: 8 }} />
                         <Text style={{ flex: 1, fontSize: 12, color: theme.colors.text.secondary }}>{expenseCategoryLabel(d.category)}</Text>
                         <Text style={{ fontSize: 12, fontFamily: theme.typography.family.semiBold }}>{formatCurrency(d.amount)}</Text>
                       </View>
                     ))}
                  </View>
               </View>
             ) : null
          }
          renderItem={({ item }: { item: Expense }) => (
            <Swipeable renderRightActions={(p, d) => renderRightActions(p, d, item.id)} friction={2}>
              <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
                <View style={[styles.iconCircle, { backgroundColor: getCatColor(item.category) + '20' }]}>
                  <Ionicons name="receipt-outline" size={20} color={getCatColor(item.category)} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                   <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>{item.description || expenseCategoryLabel(item.category)}</Text>
                   <Text style={{ fontSize: 12, color: theme.colors.text.secondary, marginTop: 4 }}>{formatDate(item.date)}</Text>
                </View>
                <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 16, color: theme.colors.danger }}>
                   {formatCurrency(item.amount)}
                </Text>
              </View>
            </Swipeable>
          )}
          onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
        />
      </View>

      <TouchableOpacity 
         style={[styles.fab, { backgroundColor: theme.colors.primary, ...theme.shadow.card }]}
         onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sheetRef.current?.expand(); }}
      >
         <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <BottomSheet ref={sheetRef} snapPoints={['65%']} title="Log Expense">
         <ScrollView style={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: theme.colors.text.secondary, marginBottom: 8 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
               {CATEGORY_OPTIONS.map((opt) => (
                 <TouchableOpacity 
                    key={opt.value}
                    style={[styles.catPill, { 
                      backgroundColor: formCategory === opt.value ? theme.colors.primary : theme.colors.surface,
                      borderColor: formCategory === opt.value ? theme.colors.primary : theme.colors.border
                    }]}
                    onPress={() => { Haptics.selectionAsync(); setFormCategory(opt.value); }}
                 >
                    <Text style={{ 
                      color: formCategory === opt.value ? '#FFF' : theme.colors.text.primary,
                      fontFamily: formCategory === opt.value ? theme.typography.family.medium : theme.typography.family.regular,
                      fontSize: 13
                    }}>{opt.label}</Text>
                 </TouchableOpacity>
               ))}
            </View>

            <FloatingInput label="Amount (₹) *" value={formAmount} onChangeText={setFormAmount} keyboardType="numeric" />
            <FloatingInput label="Description (Optional)" value={formDesc} onChangeText={setFormDesc} />

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: theme.colors.primary, marginTop: 12 }]}
              disabled={!formAmount || createMutation.isPending}
              onPress={submitExpense}
            >
              {createMutation.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Save Expense</Text>}
            </TouchableOpacity>
         </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  donutCard: { flexDirection: 'row', borderRadius: 16, padding: 20, marginHorizontal: 16, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 10 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  swipeAction: { justifyContent: 'center', alignItems: 'flex-end', width: 80, borderRadius: 12, marginBottom: 10, marginRight: 16, paddingHorizontal: 20 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  catPill: { paddingHorizontal: 16, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, borderWidth: 1 },
  submitBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 60 }
});
