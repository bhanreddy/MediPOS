import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { accountingApi } from '@/api/accounting';
import { formatCurrency } from '@/utils/format';
import { useUIStore } from '@/stores/uiStore';

export default function AccountingSummaryScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const addToast = useUIStore(s => s.addToast);

  const [from] = useState(new Date(new Date().setDate(1)).toISOString()); // dynamic filters theoretically omitted in UI standard for simple reporting view
  const [to] = useState(new Date().toISOString());

  const { data: summary, isLoading } = useQuery({
    queryKey: ['accounting', from, to],
    queryFn: () => accountingApi.getAccountingSummary(from, to)
  });

  const exportSummaries = async () => {
    if (!summary) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload = `M-POS Accounting Summary
Period: ${new Date(from).toLocaleDateString()} to ${new Date(to).toLocaleDateString()}

INCOME STATEMENT
Total Revenue: ₹${summary.totalRevenue}
Total Purchases (COGS equivalent): ₹${summary.totalPurchases}
Total Expenses: ₹${summary.totalExpenses}
Gross Margin: ${summary.totalRevenue ? ((summary.totalRevenue - summary.totalPurchases) / summary.totalRevenue * 100).toFixed(1) : 0}%

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

  if (isLoading || !summary) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const cogs = summary.totalPurchases; // Cost of goods sold roughly equates to purchases in simple retail logic requested
  const grossProfit = summary.totalRevenue - cogs;
  const grossMargin = summary.totalRevenue ? (grossProfit / summary.totalRevenue) * 100 : 0;
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
       <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ padding: 8 }}>
            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
          </TouchableOpacity>
          <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 18, color: theme.colors.text.primary }}>Accounting Summary</Text>
          <TouchableOpacity onPress={exportSummaries} hitSlop={10} style={{ padding: 8 }}>
             <Ionicons name="share-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
       </View>

       <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Income Statement */}
          <Text style={styles.sectionTitle}>Profit & Loss Statement</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
             <View style={styles.row}>
                <Text style={{ color: theme.colors.text.secondary }}>Gross Revenue</Text>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{formatCurrency(summary.totalRevenue)}</Text>
             </View>
             
             <View style={styles.row}>
                <Text style={{ color: theme.colors.text.secondary }}>(−) Returns</Text>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.medium }}>{formatCurrency(0)}</Text>
             </View>
             
             <View style={styles.row}>
                <Text style={{ color: theme.colors.text.secondary }}>Net Revenue</Text>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>{formatCurrency(summary.totalRevenue)}</Text>
             </View>
             
             <View style={styles.divider} />
             
             <View style={styles.row}>
                <Text style={{ color: theme.colors.text.secondary }}>(−) Cost of Goods (Purchases)</Text>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.medium }}>{formatCurrency(cogs)}</Text>
             </View>
             
             <View style={styles.row}>
                <View>
                   <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }}>Gross Profit</Text>
                   <Text style={{ fontSize: 11, color: theme.colors.text.secondary }}>Margin: {grossMargin.toFixed(1)}%</Text>
                </View>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>{formatCurrency(grossProfit)}</Text>
             </View>
             
             <View style={styles.divider} />
             
             <View style={styles.row}>
                <Text style={{ color: theme.colors.text.secondary }}>(−) Operating Expenses</Text>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.medium }}>{formatCurrency(summary.totalExpenses)}</Text>
             </View>
             
             <View style={[styles.row, { marginTop: 12, marginBottom: 0 }]}>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold, fontSize: 18 }}>Net Profit</Text>
                <Text style={{ color: summary.netProfit >= 0 ? theme.colors.success : theme.colors.danger, fontFamily: theme.typography.family.bold, fontSize: 24 }}>
                   {formatCurrency(summary.netProfit)}
                </Text>
             </View>
          </View>

          {/* Balance Position */}
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Balance Positions</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, paddingVertical: 8 }]}>
             <TouchableOpacity 
                style={[styles.row, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                onPress={() => router.push('/(app)/patients')}
             >
                <View>
                   <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>Outstanding Receivables</Text>
                   <Text style={{ fontSize: 12, color: theme.colors.text.secondary }}>Money owed by customers</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.success, marginRight: 8 }}>{formatCurrency(summary.receivables)}</Text>
                   <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
                </View>
             </TouchableOpacity>

             <TouchableOpacity 
                style={[styles.row, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                onPress={() => router.push('/(app)/suppliers')}
             >
                <View>
                   <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>Outstanding Payables</Text>
                   <Text style={{ fontSize: 12, color: theme.colors.text.secondary }}>Money owed to suppliers</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.danger, marginRight: 8 }}>{formatCurrency(summary.payables)}</Text>
                   <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
                </View>
             </TouchableOpacity>

             <View style={[styles.row, { paddingVertical: 12 }]}>
                <View>
                   <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.text.primary }}>Net Cash flow Position</Text>
                </View>
                <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.primary, fontSize: 18 }}>{formatCurrency(summary.cashInHand)}</Text>
             </View>
          </View>
       </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: 0.5 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12, marginLeft: 4, opacity: 0.8 },
  card: { borderRadius: 16, padding: 16, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 12 }
});
