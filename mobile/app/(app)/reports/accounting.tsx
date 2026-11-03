import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceIconButton, WorkspaceCard } from '@/components/ui/Workspace';
import { ResponsiveGrid } from '@/components/ui/ResponsiveGrid';
import { useState, useRef, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useAccountingSummary } from '@/hooks/useAccounting';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency, formatDate } from '@/utils/format';
import { useUIStore } from '@/stores/uiStore';
import { BottomSheet } from '@/components/ui/BottomSheet';

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' }
];

const PRESET_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  today: 'calendar-number-outline',
  week: 'calendar-outline',
  month: 'calendar-clear-outline',
  custom: 'options-outline',
};

export default function AccountingSummaryScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const addToast = useUIStore(s => s.addToast);

  // Date filter state
  const [activePreset, setActivePreset] = useState<string>('month');
  const [from, setFrom] = useState(() => {
    const start = new Date();
    return new Date(start.getFullYear(), start.getMonth(), 1).toISOString();
  });
  const [to, setTo] = useState(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  });

  // BottomSheet temporary filter states
  const filterSheetRef = useRef<GorhomBottomSheet>(null);
  const [tempPreset, setTempPreset] = useState<string>('month');
  const [tempFrom, setTempFrom] = useState(from);
  const [tempTo, setTempTo] = useState(to);
  const [selectingField, setSelectingField] = useState<'from' | 'to'>('from');
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const { data: summary, isLoading, isError } = useAccountingSummary(from, to);

  const getPresetDates = (presetId: string) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    end.setHours(23, 59, 59, 999);

    if (presetId === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (presetId === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
    } else if (presetId === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
    }
    return { from: start.toISOString(), to: end.toISOString() };
  };

  const getPresetLabel = (id: string) => {
    switch (id) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      default: return 'Custom Range';
    }
  };

  const handleApplyFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFrom(tempFrom);
    setTo(tempTo);
    setActivePreset(tempPreset);
    filterSheetRef.current?.close();
  };

  const handleCancelFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempFrom(from);
    setTempTo(to);
    setTempPreset(activePreset);
    filterSheetRef.current?.close();
  };

  const handlePresetSelect = (presetId: string) => {
    Haptics.selectionAsync();
    setTempPreset(presetId);
    
    if (presetId !== 'custom') {
      const range = getPresetDates(presetId);
      setTempFrom(range.from);
      setTempTo(range.to);
    } else {
      setSelectingField('from');
    }
  };

  const prevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const days = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const arr: (Date | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      arr.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      arr.push(new Date(year, month, i));
    }
    return arr;
  }, [calendarMonth]);

  const isSameDay = (d1Str: string | null, d2: Date) => {
    if (!d1Str) return false;
    const d1 = new Date(d1Str);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const isBetweenDays = (fromStr: string | null, toStr: string | null, d: Date) => {
    if (!fromStr || !toStr) return false;
    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);
    
    const current = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const f = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
    const t = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime();
    
    return current > f && current < t;
  };

  const handleDayPress = (d: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectingField === 'from') {
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      setTempFrom(start.toISOString());
      setSelectingField('to');
      if (tempTo && new Date(tempTo) < start) {
        setTempTo('');
      }
    } else {
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      if (tempFrom && end < new Date(tempFrom)) {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        setTempFrom(start.toISOString());
        setTempTo('');
      } else {
        setTempTo(end.toISOString());
        setSelectingField('from');
      }
    }
  };

  const exportSummaries = async () => {
    if (!summary) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload = `M-POS Accounting Summary
Period: ${new Date(from).toLocaleDateString()} to ${new Date(to).toLocaleDateString()}

INCOME STATEMENT
Gross Revenue: ₹${summary.totalRevenue}
Returns: ₹${summary.totalReturns}
Net Revenue: ₹${summary.netRevenue}
Cost of Goods: ₹${summary.totalPurchases}
Gross Profit: ₹${summary.grossProfit}
Gross Margin: ${summary.grossMarginPct.toFixed(1)}%
Operating Expenses: ₹${summary.totalExpenses}

Net Profit: ₹${summary.netProfit}

BALANCE POSITIONS
Outstanding Receivables: ₹${summary.receivables}
Outstanding Payables: ₹${summary.payables}
Net Cash Flow Position: ₹${summary.cashInHand}

Generated automatically by M-POS`;

      const fileUri = `${(FileSystem as any).documentDirectory}Accounting_Summary_${Date.now()}.txt`;
      await (FileSystem as any).writeAsStringAsync(fileUri, payload);
      await Sharing.shareAsync(fileUri);
    } catch {
      addToast('Failed to export summary', 'error');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (isError || !summary) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background, padding: 24 }]}>
        <Text style={{ color: theme.colors.text.secondary, textAlign: 'center', marginBottom: 16 }}>
          Could not load accounting summary. Check your connection and try again.
        </Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')}>
          <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.semiBold }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cogs = summary.totalPurchases;
  const grossProfit = summary.grossProfit;
  const grossMargin = summary.grossMarginPct;
  const isPositiveProfit = summary.netProfit >= 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
       {/* Modern Header */}
       <WorkspaceHeader title="Accounting" subtitle="Profit, expenses and balances" onBack={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')} actions={<WorkspaceIconButton icon="share-outline" label="Export accounting summary" onPress={exportSummaries} />} />

       {/* Date Filter Range Banner — Capsule Badge Style */}
       <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
          <TouchableOpacity 
             style={[styles.filterCapsule, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} 
             onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTempFrom(from);
                setTempTo(to);
                setTempPreset(activePreset);
                filterSheetRef.current?.expand();
             }}
             activeOpacity={0.8}
          >
             <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={[styles.calendarBadge, { backgroundColor: theme.colors.primaryLight }]}>
                   <Ionicons name="calendar" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                   <Text style={{ fontSize: 10, fontFamily: theme.typography.family.bold, color: theme.colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Report Period ({getPresetLabel(activePreset)})
                   </Text>
                   <Text style={{ fontSize: 13, fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary, marginTop: 2 }}>
                      {formatDate(from)} – {formatDate(to)}
                   </Text>
                </View>
             </View>
             <View style={[styles.chevronBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}>
                <Ionicons name="chevron-down" size={14} color={theme.colors.text.secondary} />
             </View>
          </TouchableOpacity>
       </View>

       <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {/* Net Profit / Loss Hero Card */}
          <View style={[styles.heroCard, { backgroundColor: '#2457E6' }]}>
             <View style={styles.heroHeader}>
                <View>
                   <Text style={styles.heroSubtitle}>NET PROFIT / LOSS</Text>
                   <Text style={styles.heroAmount}>{formatCurrency(summary.netProfit)}</Text>
                </View>
                <View style={styles.heroIconContainer}>
                   <Ionicons 
                      name={isPositiveProfit ? 'trending-up-outline' : 'trending-down-outline'} 
                      size={36} 
                      color="#FFF" 
                   />
                </View>
             </View>

             <View style={styles.heroStatsDivider} />

             <View style={styles.heroStatsRow}>
                <View style={styles.heroStatItem}>
                   <Text style={styles.heroStatLabel}>Gross Revenue</Text>
                   <Text style={styles.heroStatValue}>{formatCurrency(summary.totalRevenue)}</Text>
                </View>
                <View style={[styles.heroStatItem, { alignItems: 'flex-end' }]}>
                   <Text style={styles.heroStatLabel}>Expenses</Text>
                   <Text style={styles.heroStatValue}>{formatCurrency(summary.totalExpenses + summary.totalReturns)}</Text>
                </View>
             </View>
          </View>

          <ResponsiveGrid>
          <View>
          {/* Income Statement Detailed Breakdown */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>Profit & Loss Statement</Text>
          <WorkspaceCard style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }]}>
             
             {/* Revenue group */}
             <Text style={[styles.groupHeader, { color: theme.colors.primary }]}>REVENUE</Text>
             
             <View style={styles.breakdownRow}>
                <View style={styles.rowLabelContainer}>
                   <Ionicons name="add-circle-outline" size={16} color={theme.colors.success} style={{ marginRight: 6 }} />
                   <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }}>Gross Revenue</Text>
                </View>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }}>{formatCurrency(summary.totalRevenue)}</Text>
             </View>
             
             <View style={styles.breakdownRow}>
                <View style={styles.rowLabelContainer}>
                   <Ionicons name="remove-circle-outline" size={16} color={theme.colors.danger} style={{ marginRight: 6 }} />
                   <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }}>(-) Returns</Text>
                </View>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.semiBold }}>{formatCurrency(summary.totalReturns)}</Text>
             </View>
             
             <View style={[styles.breakdownRow, { marginBottom: 4 }]}>
                <View style={styles.rowLabelContainer}>
                   <Ionicons name="wallet-outline" size={16} color={theme.colors.text.secondary} style={{ marginRight: 6 }} />
                   <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>Net Revenue</Text>
                </View>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>{formatCurrency(summary.netRevenue)}</Text>
             </View>
             
             <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
             
             {/* Cost of Goods & Margins */}
             <Text style={[styles.groupHeader, { color: theme.colors.primary }]}>COSTS & PROFITABILITY</Text>

             <View style={styles.breakdownRow}>
                <View style={styles.rowLabelContainer}>
                   <Ionicons name="cart-outline" size={16} color={theme.colors.text.secondary} style={{ marginRight: 6 }} />
                   <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }}>(-) Purchases (COGS)</Text>
                </View>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.semiBold }}>{formatCurrency(cogs)}</Text>
             </View>
             
             <View style={styles.breakdownRow}>
                <View style={styles.rowLabelContainer}>
                   <Ionicons name="ribbon-outline" size={16} color={theme.colors.accent} style={{ marginRight: 6 }} />
                   <View>
                      <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>Gross Profit</Text>
                   </View>
                </View>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>{formatCurrency(grossProfit)}</Text>
             </View>

             {/* Dynamic Margin Indicator Bar */}
             <View style={styles.marginBarContainer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                   <Text style={{ fontSize: 11, color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }}>Gross Margin Percentage</Text>
                   <Text style={{ fontSize: 12, color: theme.colors.success, fontFamily: theme.typography.family.bold }}>{grossMargin.toFixed(1)}%</Text>
                </View>
                <View style={[styles.marginTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0' }]}>
                   <View style={[styles.marginFill, { backgroundColor: theme.colors.success, width: `${Math.min(Math.max(grossMargin || 0, 0), 100)}%` }]} />
                </View>
             </View>
             
             <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
             
             {/* Expenses */}
             <Text style={[styles.groupHeader, { color: theme.colors.primary }]}>OPERATING EXPENSES</Text>

             <View style={[styles.breakdownRow, { marginBottom: 0 }]}>
                <View style={styles.rowLabelContainer}>
                   <Ionicons name="business-outline" size={16} color={theme.colors.text.secondary} style={{ marginRight: 6 }} />
                   <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }}>Operating Expenses</Text>
                </View>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.semiBold }}>{formatCurrency(summary.totalExpenses)}</Text>
             </View>
          </WorkspaceCard>

          </View>
          <View>
          {/* Balance Position */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>Balance Positions</Text>
          <WorkspaceCard style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 0 }]}>
             <TouchableOpacity 
                style={[styles.balanceItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                onPress={() => router.push('/(app)/(tabs)/patients')}
                activeOpacity={0.7}
             >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   <View style={[styles.balanceIconBadge, { backgroundColor: theme.colors.successLight }]}>
                      <Ionicons name="arrow-down" size={16} color={theme.colors.success} />
                   </View>
                   <View style={{ marginLeft: 12 }}>
                      <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary, fontSize: 14 }}>Outstanding Receivables</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.text.secondary, marginTop: 1 }}>Money owed by customers</Text>
                   </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.success, marginRight: 8, fontSize: 15 }}>{formatCurrency(summary.receivables)}</Text>
                   <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
                </View>
             </TouchableOpacity>

             <TouchableOpacity 
                style={[styles.balanceItem, { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                onPress={() => router.push('/(app)/suppliers')}
                activeOpacity={0.7}
             >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   <View style={[styles.balanceIconBadge, { backgroundColor: theme.colors.dangerLight }]}>
                      <Ionicons name="arrow-up" size={16} color={theme.colors.danger} />
                   </View>
                   <View style={{ marginLeft: 12 }}>
                      <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary, fontSize: 14 }}>Outstanding Payables</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.text.secondary, marginTop: 1 }}>Money owed to suppliers</Text>
                   </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.danger, marginRight: 8, fontSize: 15 }}>{formatCurrency(summary.payables)}</Text>
                   <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
                </View>
             </TouchableOpacity>

             <View style={[styles.balanceItem, { paddingVertical: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   <View style={[styles.balanceIconBadge, { backgroundColor: theme.colors.primaryLight }]}>
                      <Ionicons name="cash-outline" size={16} color={theme.colors.primary} />
                   </View>
                   <View style={{ marginLeft: 12 }}>
                      <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.text.primary, fontSize: 14 }}>Net Cash Flow Position</Text>
                   </View>
                </View>
                <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.primary, fontSize: 16 }}>{formatCurrency(summary.cashInHand)}</Text>
             </View>
          </WorkspaceCard>
          </View>
          </ResponsiveGrid>
       </ScrollView>

       <BottomSheet ref={filterSheetRef} snapPoints={['85%']} title="Filter Report">
          <View style={{ flex: 1, justifyContent: 'space-between' }}>
             <ScrollView 
               style={{ flex: 1 }}
               contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 16 }}
               showsVerticalScrollIndicator={false}
             >
                {/* Presets Grid */}
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, marginBottom: 12, fontSize: 14 }}>Select Period</Text>
                <View style={styles.presetGrid}>
                   {PRESETS.map(preset => (
                      <TouchableOpacity 
                        key={preset.id} 
                        style={[
                          styles.presetBtn, 
                          { 
                            backgroundColor: tempPreset === preset.id ? theme.colors.primary : theme.colors.surface,
                            borderColor: tempPreset === preset.id ? theme.colors.primary : theme.colors.border
                          }
                        ]} 
                        onPress={() => handlePresetSelect(preset.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons 
                          name={PRESET_ICONS[preset.id]} 
                          size={16} 
                          color={tempPreset === preset.id ? theme.colors.text.inverse : theme.colors.text.secondary}
                        />
                        <Text 
                          style={{ 
                            color: tempPreset === preset.id ? theme.colors.text.inverse : theme.colors.text.secondary,
                            fontFamily: tempPreset === preset.id ? theme.typography.family.semiBold : theme.typography.family.regular,
                            fontSize: 13
                          }}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                   ))}
                </View>
                
                {/* Custom Date Range Selection */}
                {tempPreset === 'custom' && (
                   <View style={{ marginTop: 12 }}>
                      <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, marginBottom: 12, fontSize: 14 }}>Custom Date Range</Text>
                      <View style={styles.dateInputsContainer}>
                         <TouchableOpacity 
                           style={[
                             styles.dateInputBox, 
                             { 
                               borderColor: selectingField === 'from' ? theme.colors.primary : theme.colors.border,
                               backgroundColor: theme.colors.surface 
                             }
                           ]}
                           onPress={() => setSelectingField('from')}
                           activeOpacity={0.8}
                         >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                               <View>
                                  <Text style={{ color: theme.colors.text.secondary, fontSize: 9, fontFamily: theme.typography.family.medium }}>FROM DATE</Text>
                                  <Text style={{ color: theme.colors.text.primary, fontSize: 13, fontFamily: theme.typography.family.semiBold, marginTop: 2 }}>
                                     {tempFrom ? formatDate(tempFrom) : 'Select Start'}
                                  </Text>
                               </View>
                               <Ionicons name="calendar-outline" size={15} color={selectingField === 'from' ? theme.colors.primary : theme.colors.text.tertiary} />
                            </View>
                         </TouchableOpacity>
                         
                         <TouchableOpacity 
                           style={[
                             styles.dateInputBox, 
                             { 
                               borderColor: selectingField === 'to' ? theme.colors.primary : theme.colors.border,
                               backgroundColor: theme.colors.surface 
                             }
                           ]}
                           onPress={() => setSelectingField('to')}
                           activeOpacity={0.8}
                         >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                               <View>
                                  <Text style={{ color: theme.colors.text.secondary, fontSize: 9, fontFamily: theme.typography.family.medium }}>TO DATE</Text>
                                  <Text style={{ color: theme.colors.text.primary, fontSize: 13, fontFamily: theme.typography.family.semiBold, marginTop: 2 }}>
                                     {tempTo ? formatDate(tempTo) : 'Select End'}
                                  </Text>
                               </View>
                               <Ionicons name="calendar-outline" size={15} color={selectingField === 'to' ? theme.colors.primary : theme.colors.text.tertiary} />
                            </View>
                         </TouchableOpacity>
                      </View>

                      {/* Visual Calendar */}
                      <View style={[styles.calendarContainer, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                         <View style={styles.calendarHeader}>
                            <TouchableOpacity 
                              onPress={prevMonth} 
                              hitSlop={10} 
                              style={[styles.calNavBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                            >
                               <Ionicons name="chevron-back" size={16} color={theme.colors.text.primary} />
                            </TouchableOpacity>
                            <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.text.primary, fontSize: 13 }}>
                               {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </Text>
                            <TouchableOpacity 
                              onPress={nextMonth} 
                              hitSlop={10} 
                              style={[styles.calNavBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                            >
                               <Ionicons name="chevron-forward" size={16} color={theme.colors.text.primary} />
                            </TouchableOpacity>
                         </View>

                         <View style={[styles.weekdaysRow, { borderBottomColor: theme.colors.border }]}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                               <Text key={idx} style={[styles.weekdayText, { color: theme.colors.text.tertiary }]}>{day}</Text>
                            ))}
                         </View>

                         <View style={styles.daysGrid}>
                            {days.map((day, index) => {
                               if (!day) return <View key={`empty-${index}`} style={styles.dayCellEmpty} />;
                               
                               const isSelectedFrom = isSameDay(tempFrom, day);
                               const isSelectedTo = isSameDay(tempTo, day);
                               const isSelected = isSelectedFrom || isSelectedTo;
                               const inRange = isBetweenDays(tempFrom, tempTo, day);

                               return (
                                  <TouchableOpacity 
                                     key={`day-${index}`} 
                                     style={[
                                        styles.dayCell,
                                        isSelected && { backgroundColor: theme.colors.primary, borderRadius: 19 },
                                        inRange && { backgroundColor: theme.colors.primaryLight, borderRadius: 0 }
                                     ]}
                                     onPress={() => handleDayPress(day)}
                                  >
                                     <Text 
                                        style={{ 
                                           color: isSelected 
                                              ? theme.colors.text.inverse
                                              : inRange 
                                                 ? theme.colors.primary 
                                                 : theme.colors.text.primary,
                                           fontFamily: isSelected ? theme.typography.family.bold : theme.typography.family.regular,
                                           fontSize: 12
                                        }}
                                     >
                                        {day.getDate()}
                                     </Text>
                                  </TouchableOpacity>
                               );
                            })}
                         </View>
                      </View>
                   </View>
                )}
             </ScrollView>

             {/* Action Buttons (Fixed at the Bottom) */}
             <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
                <TouchableOpacity 
                  style={[styles.modalBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', flex: 1 }]} 
                  onPress={handleCancelFilter}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 2 }}
                  onPress={handleApplyFilter}
                  disabled={tempPreset === 'custom' && (!tempFrom || !tempTo)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.modalBtn, { width: '100%', backgroundColor: theme.colors.primary, opacity: tempPreset === 'custom' && (!tempFrom || !tempTo) ? 0.5 : 1 }]}>
                    <Text 
                      style={{ 
                        color: tempPreset === 'custom' && (!tempFrom || !tempTo) ? theme.colors.text.tertiary : theme.colors.text.inverse,
                        fontFamily: theme.typography.family.bold, 
                        fontSize: 14 
                      }}
                    >
                      Apply Filters
                    </Text>
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
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 8, 
    paddingBottom: 12, 
    borderBottomWidth: 0.5 
  },
  headerBtn: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    textAlign: 'center',
  },
  sectionTitle: { 
    fontSize: 15, 
    marginBottom: 12, 
    marginLeft: 4, 
    opacity: 0.9 
  },
  card: { 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  divider: { height: 1, marginVertical: 14 },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  filterCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  calendarBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCard: {
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroSubtitle: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.72)',
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heroAmount: {
    fontSize: 32,
    color: '#FFF',
    fontWeight: 'bold',
    marginTop: 6,
  },
  heroIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroStatsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginVertical: 16,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroStatItem: {
    flex: 1,
  },
  heroStatLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.72)',
    fontWeight: '600',
  },
  heroStatValue: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '700',
    marginTop: 2,
  },
  groupHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  rowLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  marginBarContainer: {
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  marginTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  marginFill: {
    height: '100%',
  },
  balanceItem: {
    flexWrap: 'wrap',
    gap: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  balanceIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    width: '48%',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dateInputsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dateInputBox: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  calendarContainer: {
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    borderWidth: 1,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 36,
  },
  modalBtn: {
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
